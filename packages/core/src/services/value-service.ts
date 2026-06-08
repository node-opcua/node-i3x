// ─────────────────────────────────────────────────────────────
// @i3x/core  —  ValueService
// ─────────────────────────────────────────────────────────────

import type { BuildResult, ModelNode } from '../domain/model-node.js';
import type { VQT, CurrentValueResult } from '../domain/vqt.js';
import type { IDataSourcePort } from '../ports/data-source.js';
import type { ILogger } from '../ports/logger.js';
import type { BulkResultItem } from '../types/api.js';
import type { ModelService } from './model-service.js';

export class ValueService {
  constructor(
    private readonly dataSource: IDataSourcePort,
    private readonly modelService: ModelService,
    private readonly logger: ILogger,
  ) {}

  async readValues(
    elementIds: string[],
    maxDepth: number = 1,
  ): Promise<BulkResultItem<CurrentValueResult>[]> {
    const model = await this.modelService.getOrBuildModel();
    const results: BulkResultItem<CurrentValueResult>[] = [];

    for (const elementId of elementIds) {
      const node = this.modelService.findNode(model, elementId);
      if (!node) {
        results.push({
          success: false, elementId,
          error: { code: 404, message: 'Object value not found' },
        });
        continue;
      }

      if (node.kind === 'property' || !node.children.length) {
        try {
          const dv = await this.dataSource.readValue(node.sourceNodeId);
          results.push({
            success: true, elementId,
            result: {
              isComposition: false,
              value: dv.value, quality: 'Good',
              timestamp: dv.timestamp,
            },
          });
        } catch {
          results.push({
            success: true, elementId,
            result: {
              isComposition: false, value: null,
              quality: 'GoodNoData',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        const components = await this._readComponents(model, node, maxDepth, 0);
        results.push({
          success: true, elementId,
          result: {
            isComposition: true, value: null, quality: 'Good',
            timestamp: new Date().toISOString(),
            components: components.size > 0
              ? Object.fromEntries(components) : null,
          },
        });
      }
    }

    return results;
  }

  async writeValue(elementId: string, value: unknown): Promise<void> {
    const model = await this.modelService.getOrBuildModel();
    const node = this.modelService.findNode(model, elementId);
    if (!node) throw new Error(`Element '${elementId}' not found`);
    await this.dataSource.writeValue(node.sourceNodeId, value);
  }

  private async _readComponents(
    model: BuildResult, parent: ModelNode,
    maxDepth: number, currentDepth: number,
  ): Promise<Map<string, VQT>> {
    if (maxDepth > 0 && currentDepth >= maxDepth) return new Map();

    const childIds = model.childrenById.get(parent.id) ?? [];
    const propIds: string[] = [];
    const propSources: string[] = [];

    for (const childId of childIds) {
      const child = model.nodesById.get(childId);
      if (child?.kind === 'property') {
        propIds.push(child.id);
        propSources.push(child.sourceNodeId);
      }
    }

    const result = new Map<string, VQT>();
    if (propSources.length > 0) {
      const values = await this.dataSource.readValues(propSources);
      const now = new Date().toISOString();
      for (let i = 0; i < propIds.length; i++) {
        const dv = values[i];
        result.set(propIds[i]!, {
          value: dv ? dv.value : null,
          quality: dv ? 'Good' : 'GoodNoData',
          timestamp: dv ? dv.timestamp : now,
        });
      }
    }
    return result;
  }
}
