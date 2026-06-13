// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  TypeService
//
// Preloads OPC UA object types and pre-builds JSON schemas
// at startup. Subsequent requests are served from cache.
// ─────────────────────────────────────────────────────────────

import type { ObjectType } from '../domain/object-type.js';
import type { IDataSourcePort } from '../ports/data-source.js';
import type { ILogger } from '../ports/logger.js';
import { buildTypeIdMap } from './model-service.js';
import { buildAllObjectTypeSchemas } from './schema-builder.js';

// ── Cached result ────────────────────────────────────────────

interface TypeCache {
  /** All mapped ObjectType records (including the UnknownType fallback). */
  readonly types: ObjectType[];
  /** Lookup by elementId for O(1) query. */
  readonly byId: ReadonlyMap<string, ObjectType>;
}

// ── Service ──────────────────────────────────────────────────

export class TypeService {
  private _cache: TypeCache | null = null;
  private _buildPromise: Promise<TypeCache> | null = null;

  constructor(
    private readonly dataSource: IDataSourcePort,
    private readonly logger: ILogger,
  ) {}

  // ── Public API ─────────────────────────────────────────────

  /**
   * Preload types at startup.
   * Always fetches fresh data and replaces the cache.
   */
  async preloadTypes(): Promise<void> {
    const t0 = Date.now();
    this._cache = await this._build();
    this._buildPromise = null;
    this.logger.info(
      `TypeService: preloaded ${this._cache.types.length} types ` +
        `in ${Date.now() - t0}ms`,
    );
  }

  /**
   * Get all object types (optionally filtered by namespace).
   * Returns cached data — O(1).
   */
  async getObjectTypes(namespaceUri?: string): Promise<ObjectType[]> {
    const cache = await this._getOrBuild();
    if (namespaceUri) {
      return cache.types.filter((t) => t.namespaceUri === namespaceUri);
    }
    return cache.types;
  }

  /**
   * Query specific types by elementId.
   * Returns results in request order with null for unknown ids.
   */
  async queryObjectTypes(elementIds: string[]): Promise<Array<ObjectType | null>> {
    const cache = await this._getOrBuild();
    return elementIds.map((eid) => cache.byId.get(eid) ?? null);
  }

  /** Drop the cache (e.g. after reconnect). */
  invalidateCache(): void {
    this._cache = null;
    this._buildPromise = null;
  }

  // ── Internal ───────────────────────────────────────────────

  private async _getOrBuild(): Promise<TypeCache> {
    if (this._cache) return this._cache;
    if (!this._buildPromise) {
      this._buildPromise = this._build().then((result) => {
        this._cache = result;
        this._buildPromise = null;
        return result;
      });
    }
    return this._buildPromise;
  }

  private async _build(): Promise<TypeCache> {
    const rawTypes = await this.dataSource.getObjectTypes();
    const idMap = buildTypeIdMap(rawTypes);
    const schemas = buildAllObjectTypeSchemas(rawTypes);

    const types: ObjectType[] = rawTypes.map((t) => ({
      elementId: idMap.get(t.sourceNodeId)!,
      displayName: t.displayName,
      namespaceUri: t.namespaceUri,
      sourceTypeId: t.sourceNodeId,
      version: null,
      schema: schemas.get(t.sourceNodeId) ?? {},
      related: null,
    }));

    // Append the UnknownType fallback
    types.push({
      elementId: 'UnknownType',
      displayName: 'UnknownType',
      namespaceUri: 'http://opcfoundation.org/UA/',
      sourceTypeId: 'ns=0;i=58',
      version: null,
      schema: {},
      related: null,
    });

    // Build lookup map
    const byId = new Map<string, ObjectType>();
    for (const t of types) {
      byId.set(t.elementId, t);
    }

    return { types, byId };
  }
}
