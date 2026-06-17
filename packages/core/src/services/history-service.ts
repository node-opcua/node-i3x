// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  HistoryService
// ─────────────────────────────────────────────────────────────

import type { BuildResult, DataQuality, ModelNode } from '../domain/model-node.js';
import type { HistoricalValueResult, VQT } from '../domain/vqt.js';
import type { IDataSourcePort, SourceHistoricalValue } from '../ports/data-source.js';
import type { ILogger } from '../ports/logger.js';
import type { BulkResultItem } from '../types/api.js';
import type { ModelService } from './model-service.js';

export class HistoryService {
  constructor(
    private readonly dataSource: IDataSourcePort,
    private readonly modelService: ModelService,
    readonly _logger: ILogger,
  ) {}

  async readHistory(
    elementIds: string[],
    startTime: Date | null,
    endTime: Date | null,
    maxDepth: number = 1,
  ): Promise<BulkResultItem<HistoricalValueResult>[]> {
    const model = await this.modelService.getOrBuildModel();
    const start = startTime ?? new Date(Date.now() - 3_600_000);
    const end = endTime ?? new Date();

    // Run all history reads in parallel — the optimized
    // OPC UA client coalesces them into batched transactions.
    const results = await Promise.all(
      elementIds.map(
        async (elementId): Promise<BulkResultItem<HistoricalValueResult>> => {
          const node = this.modelService.findNode(model, elementId);
          if (!node) {
            return {
              success: false,
              elementId,
              responseDetail: {
                title: 'Not Found',
                status: 404,
                detail: 'Element not found',
              },
            };
          }

          const isComposition = node.kind === 'asset' && node.children.length > 0;

          try {
            let history: SourceHistoricalValue[] = [];
            try {
              history = await this.dataSource.readHistory(node.sourceNodeId, start, end);
            } catch (err) {
              this._logger.debug(
                `readHistory failed for ${elementId} (${node.sourceNodeId}): ${(err as Error).message}`,
              );
              if (!isComposition) {
                throw err;
              }
            }

            const components =
              isComposition && maxDepth !== 1
                ? await this._readComponentsHistory(model, node, start, end, maxDepth, 0)
                : null;

            return {
              success: true,
              elementId,
              result: {
                isComposition,
                values: history.map((h) => ({
                  value: h.value,
                  quality: (h.quality ?? 'Good') as DataQuality,
                  timestamp: h.timestamp,
                })),
                ...(isComposition && maxDepth !== 1
                  ? {
                      components:
                        components && components.size > 0
                          ? Object.fromEntries(components)
                          : null,
                    }
                  : {}),
              },
            };
          } catch (err) {
            this._logger.debug(
              `readHistory failed for ${elementId}: ${(err as Error).message}`,
            );
            return {
              success: false,
              elementId,
              responseDetail: {
                title: 'Not Implemented',
                status: 501,
                detail: 'History read not supported',
              },
            };
          }
        },
      ),
    );

    return results;
  }

  private async _readComponentsHistory(
    model: BuildResult,
    parent: ModelNode,
    startTime: Date,
    endTime: Date,
    maxDepth: number,
    currentDepth: number,
  ): Promise<Map<string, { values: VQT[] }>> {
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
        subAssets.push(child);
      }
    }

    const result = new Map<string, { values: VQT[] }>();

    // Read history for direct property children
    if (propSources.length > 0) {
      await Promise.all(
        propIds.map(async (pid, idx) => {
          const sourceNodeId = propSources[idx]!;
          try {
            const history = await this.dataSource.readHistory(
              sourceNodeId,
              startTime,
              endTime,
            );
            result.set(pid, {
              values: history.map((h) => ({
                value: h.value,
                quality: (h.quality ?? 'Good') as DataQuality,
                timestamp: h.timestamp,
              })),
            });
          } catch (err) {
            this._logger.debug(
              `readHistory failed for child property ${pid} (${sourceNodeId}): ${(err as Error).message}`,
            );
            result.set(pid, { values: [] });
          }
        }),
      );
    }

    // Recurse into sub-object children
    for (const subAsset of subAssets) {
      const subComponents = await this._readComponentsHistory(
        model,
        subAsset,
        startTime,
        endTime,
        maxDepth,
        currentDepth + 1,
      );
      for (const [key, val] of subComponents) {
        result.set(key, val);
      }
    }

    return result;
  }
}
