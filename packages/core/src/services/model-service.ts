// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  ModelService
// ─────────────────────────────────────────────────────────────

import type { BuildResult, ModelNode } from '../domain/model-node.js';
import type {
  IDataSourcePort,
  ObjectTypeInfo,
  SourceNodeInfo,
} from '../ports/data-source.js';
import type { ILogger } from '../ports/logger.js';
import { inferKind, mapNode, stableI3xId } from './mapper.js';

export class ModelService {
  private _cache: BuildResult | null = null;
  private _buildPromise: Promise<BuildResult> | null = null;

  constructor(
    private readonly dataSource: IDataSourcePort,
    private readonly logger: ILogger,
  ) {}

  async getOrBuildModel(): Promise<BuildResult> {
    if (this._cache) return this._cache;
    if (this._buildPromise) return this._buildPromise;

    this._buildPromise = this._build();
    try {
      const result = await this._buildPromise;
      this._cache = result;
      return result;
    } finally {
      this._buildPromise = null;
    }
  }

  async preloadModel(): Promise<BuildResult> {
    const started = performance.now();
    this.logger.info('Model preload started');
    const result = await this._build();
    this._cache = result;
    this.logger.info(
      `Model preload finished nodes=${result.nodesById.size} ` +
        `roots=${result.rootIds.length} ` +
        `properties=${result.propertyToSource.size} ` +
        `actions=${result.actionToMethod.size} ` +
        `duration_ms=${(performance.now() - started).toFixed(0)}`,
    );
    return result;
  }

  invalidateCache(): void {
    this._cache = null;
  }

  setCache(result: BuildResult): void {
    this._cache = result;
  }

  findNode(model: BuildResult, elementId: string): ModelNode | null {
    const direct = model.nodesById.get(elementId);
    if (direct) return direct;
    for (const n of model.nodesById.values()) {
      if (n.name === elementId) return n;
    }
    return null;
  }

  parentIdOf(model: BuildResult, nodeId: string): string | null {
    for (const [parentId, childIds] of model.childrenById) {
      if (childIds.includes(nodeId)) return parentId;
    }
    return null;
  }

  /**
   * Internal method to build the OPC UA object and variable model.
   * Discovers the server's type hierarchy, browses the node tree,
   * constructs stable browse path identifiers, and maps the components
   * to domain-level ModelNodes.
   *
   * @returns A promise resolving to the built model result.
   */
  private async _build(): Promise<BuildResult> {
    const sourceTypes = await this.dataSource.getObjectTypes();
    const typeIdMap = this._buildTypeIdMap(sourceTypes);

    const sourceNodes = await this.dataSource.browseTree();
    const bySourceId = new Map<string, SourceNodeInfo>();
    for (const n of sourceNodes) bySourceId.set(n.sourceNodeId, n);

    const childSourcesByParent = new Map<string, string[]>();
    for (const node of sourceNodes) {
      if (node.parentSourceNodeId == null) continue;
      let list = childSourcesByParent.get(node.parentSourceNodeId);
      if (!list) {
        list = [];
        childSourcesByParent.set(node.parentSourceNodeId, list);
      }
      list.push(node.sourceNodeId);
    }

    // ── Build stable browse paths via BFS from roots ────────
    // Each path is a `/`-separated chain of `nsu=URI:BrowseName`
    // segments, e.g.  "nsu=http://di/:DeviceSet/nsu=http://x/:Pump"
    const browsePathBySourceId = new Map<string, string>();
    const roots = sourceNodes.filter((n) => n.parentSourceNodeId == null);
    const queue = roots.map((n) => ({
      sourceId: n.sourceNodeId,
      path: n.nsuQualifiedName,
    }));
    while (queue.length > 0) {
      const { sourceId, path } = queue.shift()!;
      browsePathBySourceId.set(sourceId, path);
      for (const childId of childSourcesByParent.get(sourceId) ?? []) {
        const child = bySourceId.get(childId);
        if (child) {
          queue.push({
            sourceId: childId,
            path: `${path}/${child.nsuQualifiedName}`,
          });
        }
      }
    }

    // ── Map source nodes to domain ModelNodes ────────────────
    const nodesById = new Map<string, ModelNode>();
    const childrenById = new Map<string, string[]>();
    const rootIds: string[] = [];
    const propertyToSource = new Map<string, string>();
    const actionToMethod = new Map<string, readonly [string, string]>();

    for (const [sourceId, srcNode] of bySourceId) {
      const childSources = childSourcesByParent.get(sourceId) ?? [];
      const childIds = childSources.map((cId) => {
        const cNode = bySourceId.get(cId)!;
        const cPath = browsePathBySourceId.get(cId) ?? cNode.sourceNodeId;
        return stableI3xId(cPath, inferKind(cNode));
      });

      const browsePath = browsePathBySourceId.get(sourceId) ?? srcNode.sourceNodeId;
      let typeOverride: string | null = null;
      const typeDef = srcNode.typeDefinition;
      if (typeDef && typeIdMap.has(typeDef)) {
        typeOverride = typeIdMap.get(typeDef)!;
      } else {
        typeOverride = 'UnknownType';
      }
      const mapped = mapNode(srcNode, childIds, browsePath, typeOverride);
      nodesById.set(mapped.id, mapped);
      childrenById.set(mapped.id, childIds);

      if (srcNode.parentSourceNodeId == null) rootIds.push(mapped.id);
      if (mapped.kind === 'property')
        propertyToSource.set(mapped.id, srcNode.sourceNodeId);
      if (mapped.kind === 'action' && srcNode.parentSourceNodeId != null) {
        actionToMethod.set(mapped.id, [srcNode.parentSourceNodeId, srcNode.sourceNodeId]);
      }
    }

    return { nodesById, rootIds, childrenById, propertyToSource, actionToMethod };
  }

  /**
   * Builds a map from OPC UA type definition identifier to its string classification.
   *
   * @param types List of object type info fetched from the source.
   * @returns Map of type IDs to their mapped string names.
   */
  private _buildTypeIdMap(types: readonly ObjectTypeInfo[]): Map<string, string> {
    return buildTypeIdMap(types);
  }
}

/**
 * Build a map of OPC UA sourceNodeId → i3X type elementId.
 *
 * Constructs a full nsu-qualified browse path for each type
 * by walking the parent chain up to the hierarchy root.
 * This guarantees unique elementIds even when multiple types
 * share the same browseName (siblings are always unique).
 */
export function buildTypeIdMap(types: readonly ObjectTypeInfo[]): Map<string, string> {
  // Index types by sourceNodeId for fast parent lookups
  const bySourceId = new Map<string, ObjectTypeInfo>();
  for (const t of types) bySourceId.set(t.sourceNodeId, t);

  // Cache resolved browse paths to avoid repeated walks
  const pathCache = new Map<string, string>();

  const resolvePath = (t: ObjectTypeInfo): string => {
    const cached = pathCache.get(t.sourceNodeId);
    if (cached) return cached;

    const segment = `nsu=${t.namespaceUri}:${t.browseName}`;
    let path: string;
    if (t.parentSourceNodeId == null) {
      // Root type (e.g. BaseObjectType)
      path = segment;
    } else {
      const parent = bySourceId.get(t.parentSourceNodeId);
      path = parent ? `${resolvePath(parent)}/${segment}` : segment;
    }
    pathCache.set(t.sourceNodeId, path);
    return path;
  };

  const map = new Map<string, string>();
  for (const t of types) {
    map.set(t.sourceNodeId, stableI3xId(resolvePath(t), 'type'));
  }
  return map;
}

export function emptyBuildResult(): BuildResult {
  return {
    nodesById: new Map(),
    rootIds: [],
    childrenById: new Map(),
    propertyToSource: new Map(),
    actionToMethod: new Map(),
  };
}
