// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  ValueService
// ─────────────────────────────────────────────────────────────

import type { BuildResult, DataQuality, ModelNode } from '../domain/model-node.js';
import type { CurrentValueResult, VQT } from '../domain/vqt.js';
import type { IDataSourcePort } from '../ports/data-source.js';
import type { ILogger } from '../ports/logger.js';
import type { BulkResultItem } from '../types/api.js';
import type { ModelService } from './model-service.js';

export class ValueService {
  constructor(
    private readonly dataSource: IDataSourcePort,
    private readonly modelService: ModelService,
    readonly _logger: ILogger,
  ) {}

  async readValues(
    elementIds: string[],
    maxDepth: number = 1,
  ): Promise<BulkResultItem<CurrentValueResult>[]> {
    const model = await this.modelService.getOrBuildModel();

    // ── Phase 1: classify nodes ──────────────────────────────
    // Separate leaf (property / childless) nodes from
    // composition nodes so we can batch-read all leaves in
    // one OPC UA call instead of N sequential readValue() calls.

    type LeafEntry = { idx: number; elementId: string; node: ModelNode };
    type CompEntry = { idx: number; elementId: string; node: ModelNode };

    const results: BulkResultItem<CurrentValueResult>[] = new Array(elementIds.length);
    const leaves: LeafEntry[] = [];
    const composites: CompEntry[] = [];

    for (let i = 0; i < elementIds.length; i++) {
      const elementId = elementIds[i]!;
      const node = this.modelService.findNode(model, elementId);
      if (!node) {
        results[i] = {
          success: false,
          elementId,
          error: { code: 404, message: 'Object value not found' },
        };
        continue;
      }

      if (node.kind === 'property' || !node.children.length) {
        leaves.push({ idx: i, elementId, node });
      } else {
        composites.push({ idx: i, elementId, node });
      }
    }

    // ── Phase 2: batch-read all leaf values ──────────────────
    if (leaves.length > 0) {
      const sourceIds = leaves.map((l) => l.node.sourceNodeId);
      let values: Awaited<ReturnType<IDataSourcePort['readValues']>>;
      try {
        values = await this.dataSource.readValues(sourceIds);
      } catch {
        // Fallback: mark all as GoodNoData
        values = sourceIds.map(() => ({
          value: null,
          quality: 'GoodNoData' as const,
          timestamp: new Date().toISOString(),
        }));
      }

      for (let j = 0; j < leaves.length; j++) {
        const { idx, elementId } = leaves[j]!;
        const dv = values[j];
        results[idx] = {
          success: true,
          elementId,
          result: {
            isComposition: false,
            value: dv ? dv.value : null,
            quality: (dv ? dv.quality : 'GoodNoData') as DataQuality,
            timestamp: dv ? dv.timestamp : new Date().toISOString(),
          },
        };
      }
    }

    // ── Phase 3: read composites in parallel ───────────────
    await Promise.all(
      composites.map(async ({ idx, elementId, node }) => {
        const components = await this._readComponents(model, node, maxDepth, 0);
        results[idx] = {
          success: true,
          elementId,
          result: {
            isComposition: true,
            value: null,
            quality: 'Good',
            timestamp: new Date().toISOString(),
            components: components.size > 0 ? Object.fromEntries(components) : null,
          },
        };
      }),
    );

    return results;
  }

  async writeValue(elementId: string, value: unknown): Promise<void> {
    const model = await this.modelService.getOrBuildModel();
    const node = this.modelService.findNode(model, elementId);
    if (!node) throw new Error(`Element '${elementId}' not found`);
    await this.dataSource.writeValue(node.sourceNodeId, value);
  }

  private async _readComponents(
    model: BuildResult,
    parent: ModelNode,
    maxDepth: number,
    currentDepth: number,
  ): Promise<Map<string, VQT>> {
    if (maxDepth > 0 && currentDepth >= maxDepth) return new Map();

    const childIds = model.childrenById.get(parent.id) ?? [];
    const propIds: string[] = [];
    const propSources: string[] = [];
    const subAssets: ModelNode[] = [];

    for (const childId of childIds) {
      const child = model.nodesById.get(childId);
      if (!child) continue;
      if (child.kind === 'property') {
        propIds.push(child.id);
        propSources.push(child.sourceNodeId);
      } else if (child.children.length > 0) {
        // Sub-object with children — recurse
        subAssets.push(child);
      }
    }

    const result = new Map<string, VQT>();

    // Read direct property children
    if (propSources.length > 0) {
      const values = await this.dataSource.readValues(propSources);
      const now = new Date().toISOString();
      for (let i = 0; i < propIds.length; i++) {
        const dv = values[i];
        const pid = propIds[i];
        if (!pid) continue;
        result.set(pid, {
          value: dv ? dv.value : null,
          quality: (dv ? dv.quality : 'GoodNoData') as DataQuality,
          timestamp: dv ? dv.timestamp : now,
        });
      }
    }

    // Recurse into sub-object children
    for (const subAsset of subAssets) {
      const subComponents = await this._readComponents(
        model,
        subAsset,
        maxDepth,
        currentDepth + 1,
      );
      for (const [key, vqt] of subComponents) {
        result.set(key, vqt);
      }
    }

    return result;
  }
}
