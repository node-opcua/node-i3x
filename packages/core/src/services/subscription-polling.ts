// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  Subscription polling loop
//
// Software polling fallback for data sources that do not
// support native OPC UA monitored subscriptions.
// ─────────────────────────────────────────────────────────────

import type { IDataSourcePort } from '../ports/data-source.js';
import type { ILogger } from '../ports/logger.js';

/**
 * Callback invoked when a polled data change is detected.
 * Mirrors the signature used by SubscriptionService._onDataChange.
 */
export type PollingDataChangeCallback = (
  sourceNodeId: string,
  value: unknown,
  quality: string,
  timestamp: string,
) => void;

/**
 * Starts a software polling loop that periodically reads all
 * monitored source node IDs and reports changes via the
 * `onDataChange` callback.
 *
 * The loop runs until `isAlive()` returns false.
 *
 * @param subscriptionId  Used for logging only.
 * @param getSourceIds    Returns the current set of source node IDs to poll.
 * @param isAlive         Returns false to stop the loop.
 * @param dataSource      The data-source port used for reading values.
 * @param logger          Logger instance.
 * @param intervalMs      Milliseconds between poll cycles.
 * @param onDataChange    Callback for each polled value.
 */
export function startPollingLoop(
  subscriptionId: string,
  getSourceIds: () => string[],
  isAlive: () => boolean,
  dataSource: IDataSourcePort,
  logger: ILogger,
  intervalMs: number,
  onDataChange: PollingDataChangeCallback,
): void {
  const poll = async () => {
    while (isAlive()) {
      try {
        const sourceIds = getSourceIds();
        if (sourceIds.length > 0) {
          const values = await dataSource.readValues(sourceIds);
          const now = new Date().toISOString();
          for (let i = 0; i < sourceIds.length; i++) {
            const dv = values[i];
            if (dv) {
              onDataChange(
                sourceIds[i]!,
                dv.value,
                dv.quality ?? 'Good',
                dv.timestamp ?? now,
              );
            }
          }
        }
      } catch (err) {
        logger.warn(`Poll error for subscription ${subscriptionId}: ${err}`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };
  poll().catch(() => {});
}
