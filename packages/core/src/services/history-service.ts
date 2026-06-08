// ─────────────────────────────────────────────────────────────
// @i3x/core  —  HistoryService
// ─────────────────────────────────────────────────────────────

import type { HistoricalValueResult } from '../domain/vqt.js';
import type { IDataSourcePort } from '../ports/data-source.js';
import type { ILogger } from '../ports/logger.js';
import type { BulkResultItem } from '../types/api.js';
import type { ModelService } from './model-service.js';

export class HistoryService {
  constructor(
    private readonly dataSource: IDataSourcePort,
    private readonly modelService: ModelService,
    private readonly logger: ILogger,
  ) {}

  async readHistory(
    elementIds: string[],
    startTime: Date | null,
    endTime: Date | null,
  ): Promise<BulkResultItem<HistoricalValueResult>[]> {
    const model = await this.modelService.getOrBuildModel();
    const results: BulkResultItem<HistoricalValueResult>[] = [];
    const start = startTime ?? new Date(Date.now() - 3_600_000);
    const end = endTime ?? new Date();

    for (const elementId of elementIds) {
      const node = this.modelService.findNode(model, elementId);
      if (!node) {
        results.push({
          success: false, elementId,
          error: { code: 404, message: 'Element not found' },
        });
        continue;
      }

      try {
        const history = await this.dataSource.readHistory(
          node.sourceNodeId, start, end,
        );
        results.push({
          success: true, elementId,
          result: {
            isComposition: false,
            values: history.map((h) => ({
              value: h.value, quality: 'Good' as const,
              timestamp: h.timestamp,
            })),
          },
        });
      } catch (err) {
        results.push({
          success: false, elementId,
          error: { code: 501, message: 'History read not supported' },
        });
      }
    }

    return results;
  }
}
