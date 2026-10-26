import type {
  BulkResponse,
  BulkResultItem,
  CurrentValueResult,
  HistoricalValueResult,
  Namespace,
  ObjectInstanceResponse,
  ObjectType,
  RelatedObjectResult,
  RelationshipType,
  ServerInfo,
  SuccessResponse,
} from '@node-i3x/core';
import { rankObjectSuggestions } from '../utils/similarity.js';
import type { ElementResult, I3XClientBinding, Suggestion } from './types.js';

/** How long the full object list used for suggestions is reused. */
const OBJECT_CACHE_TTL_MS = 60_000;

export class RestClientBinding implements I3XClientBinding {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl?: typeof fetch;
  private objectCache?: { at: number; objects: Promise<ObjectInstanceResponse[]> };

  /**
   * @param fetchImpl - replaces the global fetch, e.g. to route requests into an
   *   in-process server (see InProcessConnectorBinding).
   */
  constructor(
    baseUrl = 'http://localhost:3000',
    token?: string,
    timeoutMs = 15_000,
    fetchImpl?: typeof fetch,
  ) {
    let cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }
    // i3X base URLs are usually given with the /v1 suffix; every path below adds it.
    cleanUrl = cleanUrl.replace(/\/v1$/i, '');
    this.baseUrl = cleanUrl;
    this.requestTimeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) {
      this.headers.Authorization = `Bearer ${token}`;
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const signal = options.signal || AbortSignal.timeout(this.requestTimeoutMs);

    try {
      const response = await (this.fetchImpl ?? fetch)(url, {
        ...options,
        signal,
        headers: {
          ...this.headers,
          ...(options.headers || {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const truncated =
          errorText.length > 300 ? `${errorText.slice(0, 300)}...` : errorText;
        throw new Error(`HTTP ${response.status} from ${path}: ${truncated}`);
      }

      return (await response.json()) as T;
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') {
        throw new Error(
          `i3X Gateway request timed out after ${this.requestTimeoutMs}ms for ${path}`,
        );
      }
      throw err;
    }
  }

  /** Unwrap a `{ success, result }` envelope; a `success: false` envelope becomes an error. */
  private async get<T>(path: string): Promise<T> {
    const res = await this.request<Partial<SuccessResponse<T>> & ErrorEnvelope>(path);
    if (res?.success !== true || !('result' in res)) {
      throw new Error(`i3X request ${path} failed: ${describeFailure(res)}`);
    }
    return res.result as T;
  }

  /**
   * POST a bulk request and return its `results` items, one per requested elementId.
   * `success` is false on the envelope as soon as one item failed, so items are
   * returned as they are; only a body without `results` is an error here.
   */
  private async postBulk<T>(path: string, body: unknown): Promise<BulkResultItem<T>[]> {
    const res = await this.request<Partial<BulkResponse<T>> & ErrorEnvelope>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!Array.isArray(res?.results)) {
      throw new Error(`i3X request ${path} failed: ${describeFailure(res)}`);
    }
    return res.results;
  }

  /** Bulk items as per-element results: a failed item keeps its elementId and error. */
  private async postBulkPerElement<T>(
    path: string,
    elementIds: string[],
    body: Record<string, unknown>,
  ): Promise<ElementResult<T>[]> {
    const items = await this.postBulk<T>(path, { elementIds, ...body });
    return items.map((item, idx) => {
      const elementId = item.elementId ?? elementIds[idx] ?? `element_${idx}`;
      if (!item.success) return { elementId, error: describeFailure(item) };
      // A success without a result would otherwise read as "no data" with no warning.
      if (item.result == null) return { elementId, error: 'Server returned no result' };
      return { elementId, result: item.result as T };
    });
  }

  /** The single item of a one-element bulk request. */
  private async postBulkOne<T>(
    path: string,
    body: { elementIds: [string] } & Record<string, unknown>,
  ): Promise<BulkResultItem<T>> {
    const [item] = await this.postBulk<T>(path, body);
    if (!item) throw new Error(`i3X request ${path} returned no result`);
    return item;
  }

  async getInfo(): Promise<ServerInfo> {
    return this.get<ServerInfo>('/v1/info');
  }

  async getNamespaces(): Promise<Namespace[]> {
    return this.get<Namespace[]>('/v1/namespaces');
  }

  async getObjectTypes(namespaceUri?: string): Promise<ObjectType[]> {
    const query = namespaceUri ? `?namespaceUri=${encodeURIComponent(namespaceUri)}` : '';
    return this.get<ObjectType[]>(`/v1/objecttypes${query}`);
  }

  async getRelationshipTypes(): Promise<RelationshipType[]> {
    return this.get<RelationshipType[]>('/v1/relationshiptypes');
  }

  async getObjects(options?: {
    rootOnly?: boolean;
    typeElementId?: string;
  }): Promise<ObjectInstanceResponse[]> {
    const params = new URLSearchParams();
    if (options?.rootOnly) params.set('root', 'true');
    if (options?.typeElementId) params.set('typeElementId', options.typeElementId);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.get<ObjectInstanceResponse[]>(`/v1/objects${query}`);
  }

  /** `null` only when the server reports the element as not found (404). */
  async getObjectById(elementId: string): Promise<ObjectInstanceResponse | null> {
    const path = '/v1/objects/list';
    const item = await this.postBulkOne<ObjectInstanceResponse>(path, {
      elementIds: [elementId],
    });
    if (item.success) return item.result ?? null;
    if (item.responseDetail?.status === 404) return null;
    throw new Error(
      `i3X request ${path} failed for '${elementId}': ${describeFailure(item)}`,
    );
  }

  async getRelatedObjects(
    elementId: string,
    relationshipType?: string,
  ): Promise<RelatedObjectResult[]> {
    const path = '/v1/objects/related';
    const body: { elementIds: [string] } & Record<string, unknown> = {
      elementIds: [elementId],
    };
    if (relationshipType) body.relationshipType = relationshipType;

    const item = await this.postBulkOne<RelatedObjectResult[]>(path, body);
    if (!item.success) {
      throw new Error(
        `i3X request ${path} failed for '${elementId}': ${describeFailure(item)}`,
      );
    }
    // Servers may ignore relationshipType, so filter here as well.
    return (item.result ?? []).filter(
      (r) => !relationshipType || r.sourceRelationship === relationshipType,
    );
  }

  async getObjectValues(
    elementIds: string[],
    maxDepth = 1,
  ): Promise<ElementResult<CurrentValueResult>[]> {
    return this.postBulkPerElement<CurrentValueResult>('/v1/objects/value', elementIds, {
      maxDepth,
    });
  }

  async getHistoricalValues(
    elementIds: string[],
    startTime: string,
    endTime: string,
    maxDepth = 1,
  ): Promise<ElementResult<HistoricalValueResult>[]> {
    return this.postBulkPerElement<HistoricalValueResult>(
      '/v1/objects/history',
      elementIds,
      { startTime, endTime, maxDepth },
    );
  }

  /** Closest objects by elementId or displayName; a failure to list objects propagates. */
  async findSuggestions(query: string): Promise<Suggestion[]> {
    const now = Date.now();
    if (!this.objectCache || now - this.objectCache.at > OBJECT_CACHE_TTL_MS) {
      const objects = this.getObjects();
      this.objectCache = { at: now, objects };
      objects.catch(() => {
        if (this.objectCache?.objects === objects) this.objectCache = undefined;
      });
    }
    return rankObjectSuggestions(query, await this.objectCache.objects);
  }
}

interface ErrorEnvelope {
  success?: boolean;
  responseDetail?: { title?: string; status?: number; detail?: string } | null;
}

function describeFailure(res: ErrorEnvelope | null | undefined): string {
  const d = res?.responseDetail;
  if (d) return [d.status, d.title, d.detail].filter(Boolean).join(' ');
  return `unexpected response ${JSON.stringify(res)?.slice(0, 200)}`;
}
