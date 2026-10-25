import type {
  BulkResponse,
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
import { rankSuggestions } from '../utils/similarity.js';
import type { I3XClientBinding } from './types.js';

export class RestClientBinding implements I3XClientBinding {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly requestTimeoutMs: number;

  constructor(baseUrl = 'http://localhost:3000', token?: string, timeoutMs = 15_000) {
    let cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }
    // i3X base URLs are usually given with the /v1 suffix; every path below adds it.
    cleanUrl = cleanUrl.replace(/\/v1$/i, '');
    this.baseUrl = cleanUrl;
    this.requestTimeoutMs = timeoutMs;
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
      const response = await fetch(url, {
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
  private async get<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await this.request<Partial<SuccessResponse<T>> & ErrorEnvelope>(
      path,
      options,
    );
    if (res?.success !== true || !('result' in res)) {
      throw new Error(`i3X request ${path} failed: ${describeFailure(res)}`);
    }
    return res.result as T;
  }

  /**
   * Unwrap a bulk `{ success, results: [{ elementId, success, result }] }` envelope,
   * one entry per requested elementId, in request order. A failed item becomes an
   * error naming its elementId; `notFoundAsNull` maps a 404 item to `null` instead.
   */
  private async getBulk<T>(
    path: string,
    body: unknown,
    notFoundAsNull?: false,
  ): Promise<T[]>;
  private async getBulk<T>(
    path: string,
    body: unknown,
    notFoundAsNull: true,
  ): Promise<Array<T | null>>;
  private async getBulk<T>(
    path: string,
    body: unknown,
    notFoundAsNull = false,
  ): Promise<Array<T | null>> {
    const res = await this.request<Partial<BulkResponse<T>> & ErrorEnvelope>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!Array.isArray(res?.results)) {
      throw new Error(`i3X request ${path} failed: ${describeFailure(res)}`);
    }
    return res.results.map((item) => {
      if (item.success) return (item.result ?? null) as T | null;
      if (notFoundAsNull && item.responseDetail?.status === 404) return null;
      throw new Error(
        `i3X request ${path} failed for '${item.elementId}': ${describeFailure(item)}`,
      );
    });
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

  async getObjectById(elementId: string): Promise<ObjectInstanceResponse | null> {
    const [object] = await this.getBulk<ObjectInstanceResponse>(
      '/v1/objects/list',
      { elementIds: [elementId] },
      true,
    );
    return object ?? null;
  }

  async getRelatedObjects(
    elementId: string,
    relationshipType?: string,
  ): Promise<ObjectInstanceResponse[]> {
    const body: Record<string, unknown> = { elementIds: [elementId] };
    if (relationshipType) body.relationshipType = relationshipType;

    const [related] = await this.getBulk<RelatedObjectResult[]>(
      '/v1/objects/related',
      body,
    );
    // Servers may ignore relationshipType, so filter here as well.
    return (related ?? [])
      .filter((r) => !relationshipType || r.sourceRelationship === relationshipType)
      .map((r) => r.object);
  }

  async getObjectValues(
    elementIds: string[],
    maxDepth = 1,
  ): Promise<CurrentValueResult[]> {
    return this.getBulk<CurrentValueResult>('/v1/objects/value', {
      elementIds,
      maxDepth,
    });
  }

  async getHistoricalValues(
    elementIds: string[],
    startTime: string,
    endTime: string,
    maxDepth = 1,
  ): Promise<HistoricalValueResult[]> {
    return this.getBulk<HistoricalValueResult>('/v1/objects/history', {
      elementIds,
      startTime,
      endTime,
      maxDepth,
    });
  }

  async findSuggestions(unknownId: string): Promise<string[]> {
    try {
      const allObjects = await this.getObjects();
      const candidates = allObjects.map((o) => o.elementId);
      return rankSuggestions(unknownId, candidates, 5, 0.4);
    } catch {
      return [];
    }
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
