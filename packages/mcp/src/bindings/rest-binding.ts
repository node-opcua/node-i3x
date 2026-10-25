import type {
  CurrentValueResult,
  HistoricalValueResult,
  Namespace,
  ObjectInstanceResponse,
  ObjectType,
  RelationshipType,
  ServerInfo,
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

  async getInfo(): Promise<ServerInfo> {
    return this.request<ServerInfo>('/v1/info');
  }

  async getNamespaces(): Promise<Namespace[]> {
    const res = await this.request<{ namespaces: Namespace[] }>('/v1/namespaces');
    return res.namespaces || [];
  }

  async getObjectTypes(namespaceUri?: string): Promise<ObjectType[]> {
    const query = namespaceUri ? `?namespaceUri=${encodeURIComponent(namespaceUri)}` : '';
    const res = await this.request<{ objectTypes: ObjectType[] }>(
      `/v1/objecttypes${query}`,
    );
    return res.objectTypes || [];
  }

  async getRelationshipTypes(): Promise<RelationshipType[]> {
    const res = await this.request<{ relationshipTypes: RelationshipType[] }>(
      '/v1/relationshiptypes',
    );
    return res.relationshipTypes || [];
  }

  async getObjects(options?: {
    rootOnly?: boolean;
    typeElementId?: string;
  }): Promise<ObjectInstanceResponse[]> {
    const params = new URLSearchParams();
    if (options?.rootOnly) params.set('root', 'true');
    if (options?.typeElementId) params.set('typeElementId', options.typeElementId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ objects: ObjectInstanceResponse[] }>(
      `/v1/objects${query}`,
    );
    return res.objects || [];
  }

  async getObjectById(elementId: string): Promise<ObjectInstanceResponse | null> {
    try {
      const res = await this.request<{ objects: ObjectInstanceResponse[] }>(
        '/v1/objects/list',
        {
          method: 'POST',
          body: JSON.stringify({ elementIds: [elementId] }),
        },
      );
      if (res.objects && res.objects.length > 0) {
        return res.objects[0] ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async getRelatedObjects(
    elementId: string,
    relationshipType?: string,
  ): Promise<ObjectInstanceResponse[]> {
    try {
      const body: Record<string, unknown> = { elementId };
      if (relationshipType) body.relationshipType = relationshipType;

      const res = await this.request<{
        relatedObjects: Array<{ targetObject: ObjectInstanceResponse }>;
      }>('/v1/objects/related', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return (res.relatedObjects || []).map((r) => r.targetObject);
    } catch {
      return [];
    }
  }

  async getObjectValues(
    elementIds: string[],
    maxDepth = 1,
  ): Promise<CurrentValueResult[]> {
    const res = await this.request<{ values: CurrentValueResult[] }>(
      '/v1/objects/value',
      {
        method: 'POST',
        body: JSON.stringify({ elementIds, maxDepth }),
      },
    );
    return res.values || [];
  }

  async getHistoricalValues(
    elementIds: string[],
    startTime: string,
    endTime: string,
    maxDepth = 1,
  ): Promise<HistoricalValueResult[]> {
    const res = await this.request<{ history: HistoricalValueResult[] }>(
      '/v1/objects/history',
      {
        method: 'POST',
        body: JSON.stringify({ elementIds, startTime, endTime, maxDepth }),
      },
    );
    return res.history || [];
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
