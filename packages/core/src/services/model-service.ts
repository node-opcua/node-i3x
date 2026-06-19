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
    private readonly options?: { typeIdFormat?: 'hash' | 'name' | 'prefixed-name' },
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

    const findParentAsset = (node: SourceNodeInfo): SourceNodeInfo | null => {
      let curr = node;
      let topmostObject: SourceNodeInfo | null = null;
      while (curr.parentSourceNodeId) {
        const parent = bySourceId.get(curr.parentSourceNodeId);
        if (!parent) break;
        if (
          parent.browseName === 'DeviceSet' ||
          parent.browseName === 'Objects' ||
          parent.browseName === 'ObjectsFolder' ||
          parent.browseName === 'Server'
        ) {
          break;
        }
        if (parent.nodeClass === 'Object') {
          topmostObject = parent;
        }
        curr = parent;
      }
      return topmostObject;
    };

    const idCache = new Map<string, string>();
    const getNodeId = (sourceId: string): string => {
      const cached = idCache.get(sourceId);
      if (cached) return cached;

      const node = bySourceId.get(sourceId)!;
      const kind = inferKind(node);
      const browsePath = browsePathBySourceId.get(sourceId) ?? node.sourceNodeId;

      if (kind === 'property') {
        const parentAsset = findParentAsset(node);
        if (parentAsset) {
          const parentAssetPath =
            browsePathBySourceId.get(parentAsset.sourceNodeId) ??
            parentAsset.sourceNodeId;
          const parentAssetId = stableI3xId(parentAssetPath, inferKind(parentAsset));

          const relativePath = browsePath.slice(parentAssetPath.length + 1);

          const cleanName = (name: string): string => {
            let cleaned = name;
            const cttIndex = cleaned.toLowerCase().indexOf('-for-ctt-');
            if (cttIndex >= 0) {
              cleaned = cleaned.slice(cttIndex + 9);
            }
            return cleaned
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
          };

          const segments = relativePath.includes('nsu=')
            ? relativePath.split('/nsu=')
            : relativePath.split('/');

          const cleanSegments = segments.map((segment) => {
            const colonIdx = segment.lastIndexOf(':');
            const name = colonIdx >= 0 ? segment.slice(colonIdx + 1) : segment;
            return cleanName(name);
          });
          const relativePathCleaned = cleanSegments.filter(Boolean).join('-');

          const parentName = parentAsset.displayName || parentAsset.browseName;
          const parentNameCleaned = cleanName(parentName);

          const hashPart = parentAssetId.split('-')[1];
          const propertyId = `property-${hashPart}-${parentNameCleaned}-${relativePathCleaned}`;
          idCache.set(sourceId, propertyId);
          return propertyId;
        }
      }

      const standardId = stableI3xId(browsePath, kind);
      idCache.set(sourceId, standardId);
      return standardId;
    };

    for (const [sourceId, srcNode] of bySourceId) {
      const childSources = childSourcesByParent.get(sourceId) ?? [];
      const childIds = childSources.map((cId) => getNodeId(cId));

      const browsePath = browsePathBySourceId.get(sourceId) ?? srcNode.sourceNodeId;
      let typeOverride: string | null = null;
      const typeDef = srcNode.typeDefinition;
      if (typeDef && typeIdMap.has(typeDef)) {
        typeOverride = typeIdMap.get(typeDef)!;
      } else {
        typeOverride = 'UnknownType';
      }

      const nodeId = getNodeId(sourceId);
      const mapped = {
        ...mapNode(srcNode, childIds, browsePath, typeOverride),
        id: nodeId,
      };

      nodesById.set(nodeId, mapped);
      childrenById.set(nodeId, childIds);

      if (srcNode.parentSourceNodeId == null) rootIds.push(nodeId);
      if (mapped.kind === 'property') propertyToSource.set(nodeId, srcNode.sourceNodeId);
      if (mapped.kind === 'action' && srcNode.parentSourceNodeId != null) {
        actionToMethod.set(nodeId, [srcNode.parentSourceNodeId, srcNode.sourceNodeId]);
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
    return buildTypeIdMap(types, this.options?.typeIdFormat);
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
export function buildTypeIdMap(
  types: readonly ObjectTypeInfo[],
  format: 'hash' | 'name' | 'prefixed-name' = 'prefixed-name',
): Map<string, string> {
  // Index types by sourceNodeId for fast parent lookups
  const bySourceId = new Map<string, ObjectTypeInfo>();
  for (const t of types) bySourceId.set(t.sourceNodeId, t);

  // Cache resolved browse paths to avoid repeated walks
  const pathCache = new Map<string, string>();

  const resolvePath = (t: ObjectTypeInfo): string => {
    const cached = pathCache.get(t.sourceNodeId);
    if (cached) return cached;

    const segment = `nsu=${t.namespaceUri}:${t.browseName || t.displayName || ''}`;
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

  const getPrefix = (t: ObjectTypeInfo): string => {
    const lineage = new Set<string>();
    let curr: ObjectTypeInfo | undefined = t;
    while (curr) {
      lineage.add(curr.browseName || curr.displayName || '');
      lineage.add(curr.sourceNodeId);
      if (curr.parentSourceNodeId) {
        curr = bySourceId.get(curr.parentSourceNodeId);
      } else {
        break;
      }
    }

    if (lineage.has('BaseInterfaceType') || lineage.has('ns=0;i=17602')) {
      return 'interface-type';
    }
    if (lineage.has('AlarmConditionType') || lineage.has('ns=0;i=2915')) {
      return 'alarm-type';
    }
    if (lineage.has('ConditionType') || lineage.has('ns=0;i=2782')) {
      return 'condition-type';
    }
    if (lineage.has('BaseEventType') || lineage.has('ns=0;i=2041')) {
      return 'event-type';
    }
    if (lineage.has('StateMachineType') || lineage.has('ns=0;i=2299')) {
      return 'state-machine-type';
    }
    if (lineage.has('BaseVariableType') || lineage.has('ns=0;i=62')) {
      return 'variable-type';
    }
    if (lineage.has('BaseDataType') || lineage.has('ns=0;i=24')) {
      return 'datatype';
    }
    return 'object-type';
  };

  const map = new Map<string, string>();
  for (const t of types) {
    if (format === 'hash') {
      map.set(t.sourceNodeId, stableI3xId(resolvePath(t), 'type'));
    } else {
      const match = t.sourceNodeId.match(/^(?:ns=\d+;)?(.+)$/);
      const identifier = match ? match[1] : t.sourceNodeId;
      const nsuPart = `nsu=${t.namespaceUri};${identifier}`;
      const lowercaseName = (t.browseName || t.displayName || '').toLowerCase();
      if (format === 'prefixed-name') {
        const prefix = getPrefix(t);
        map.set(t.sourceNodeId, `${prefix}:${lowercaseName} [ ${nsuPart} ]`);
      } else {
        map.set(t.sourceNodeId, `${lowercaseName} [ ${nsuPart} ]`);
      }
    }
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
