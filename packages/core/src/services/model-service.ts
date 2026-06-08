// ─────────────────────────────────────────────────────────────
// @i3x/core  —  ModelService
// ─────────────────────────────────────────────────────────────

import type { BuildResult, ModelNode, NodeKind } from '../domain/model-node.js';
import type { IDataSourcePort, SourceNodeInfo } from '../ports/data-source.js';
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

  invalidateCache(): void { this._cache = null; }

  setCache(result: BuildResult): void { this._cache = result; }

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

  private async _build(): Promise<BuildResult> {
    const sourceNodes = await this.dataSource.browseTree();
    const bySourceId = new Map<string, SourceNodeInfo>();
    for (const n of sourceNodes) bySourceId.set(n.sourceNodeId, n);

    const childSourcesByParent = new Map<string, string[]>();
    for (const node of sourceNodes) {
      if (node.parentSourceNodeId == null) continue;
      let list = childSourcesByParent.get(node.parentSourceNodeId);
      if (!list) { list = []; childSourcesByParent.set(node.parentSourceNodeId, list); }
      list.push(node.sourceNodeId);
    }

    const nodesById = new Map<string, ModelNode>();
    const childrenById = new Map<string, string[]>();
    const rootIds: string[] = [];
    const propertyToSource = new Map<string, string>();
    const actionToMethod = new Map<string, readonly [string, string]>();

    for (const [sourceId, srcNode] of bySourceId) {
      const childSources = childSourcesByParent.get(sourceId) ?? [];
      const childIds = childSources.map((cId) => {
        const cNode = bySourceId.get(cId)!;
        return stableI3xId(cNode.sourceNodeId, inferKind(cNode));
      });

      const mapped = mapNode(srcNode, childIds);
      nodesById.set(mapped.id, mapped);
      childrenById.set(mapped.id, childIds);

      if (srcNode.parentSourceNodeId == null) rootIds.push(mapped.id);
      if (mapped.kind === 'property') propertyToSource.set(mapped.id, srcNode.sourceNodeId);
      if (mapped.kind === 'action' && srcNode.parentSourceNodeId != null) {
        actionToMethod.set(mapped.id, [srcNode.parentSourceNodeId, srcNode.sourceNodeId]);
      }
    }

    return { nodesById, rootIds, childrenById, propertyToSource, actionToMethod };
  }
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
