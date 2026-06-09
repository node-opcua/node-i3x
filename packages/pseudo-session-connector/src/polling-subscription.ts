// ─────────────────────────────────────────────────────────────
// @node-i3x/pseudo-session-connector — PollingMonitoredSubscription
// Polling-based: setInterval + IBasicSession.read()
// ─────────────────────────────────────────────────────────────

import type {
  DataChangeCallback,
  ILogger,
  IMonitoredSubscription,
} from '@node-i3x/core';
import { AttributeIds } from 'node-opcua-data-model';
import { coerceNodeId } from 'node-opcua-nodeid';
import type { IBasicSessionAsync } from 'node-opcua-pseudo-session';
import type { ReadValueIdOptions } from 'node-opcua-types';

/**
 * IMonitoredSubscription backed by periodic polling via
 * IBasicSession.read().
 *
 * Works with both PseudoSession (in-process) and any session
 * that implements IBasicSessionAsync (including ClientSession).
 * Fires the callback only when a value differs from the
 * previous poll.
 */
export class PollingMonitoredSubscription
  implements IMonitoredSubscription {

  readonly id: string;
  private _cb: DataChangeCallback | null = null;
  private readonly _nodeIds = new Set<string>();
  private readonly _lastValues = new Map<string, unknown>();
  private _timer: ReturnType<typeof setInterval> | null =
    null;

  constructor(
    private readonly _session: IBasicSessionAsync,
    private readonly _intervalMs: number,
    private readonly _logger: ILogger,
  ) {
    this.id = `poll-sub-${Date.now()}`;
  }

  async addItems(sourceNodeIds: string[]): Promise<void> {
    for (const id of sourceNodeIds) this._nodeIds.add(id);
    this._ensurePolling();
  }

  async removeItems(sourceNodeIds: string[]): Promise<void> {
    for (const id of sourceNodeIds) {
      this._nodeIds.delete(id);
      this._lastValues.delete(id);
    }
    if (this._nodeIds.size === 0) this._stopPolling();
  }

  onDataChange(cb: DataChangeCallback): void {
    this._cb = cb;
  }

  async close(): Promise<void> {
    this._stopPolling();
    this._nodeIds.clear();
    this._lastValues.clear();
    this._cb = null;
  }

  // ── Private ──────────────────────────────────────────────

  private _ensurePolling(): void {
    if (this._timer) return;
    this._timer = setInterval(
      () => { void this._poll(); },
      this._intervalMs,
    );
  }

  private _stopPolling(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private async _poll(): Promise<void> {
    if (!this._cb || this._nodeIds.size === 0) return;
    const ids = [...this._nodeIds];
    const items: ReadValueIdOptions[] = ids.map((id) => ({
      nodeId: coerceNodeId(id),
      attributeId: AttributeIds.Value,
    }));

    try {
      const dvs = await this._session.read(items);
      const arr = Array.isArray(dvs) ? dvs : [dvs];

      for (let i = 0; i < ids.length; i++) {
        const dv = arr[i]!;
        const nodeId = ids[i]!;
        const val = dv.value?.value;
        const prev = this._lastValues.get(nodeId);

        if (val !== prev) {
          this._lastValues.set(nodeId, val);
          this._cb(
            nodeId,
            val,
            dv.statusCode?.name ?? 'Good',
            dv.sourceTimestamp?.toISOString() ??
              new Date().toISOString(),
          );
        }
      }
    } catch (err) {
      this._logger.error(
        `Polling subscription error: ${err}`,
      );
    }
  }
}
