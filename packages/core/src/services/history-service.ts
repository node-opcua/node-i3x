// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  HistoryService
// ─────────────────────────────────────────────────────────────

import type { DataQuality } from '../domain/model-node.js';
import type { HistoricalValueResult } from '../domain/vqt.js';
import type { IDataSourcePort } from '../ports/data-source.js';
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

          try {
            const history = await this.dataSource.readHistory(
              node.sourceNodeId,
              start,
              end,
            );
            return {
              success: true,
              elementId,
              result: {
                isComposition: false,
                values: history.map((h) => ({
                  value: h.value,
                  quality: (h.quality ?? 'Good') as DataQuality,
                  timestamp: h.timestamp,
                })),
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
}
