// ─────────────────────────────────────────────────────────────
// @node-i3x/pseudo-session-connector — AddressSpaceMonitoredSubscription
// Event-based: UAVariable.on("value_changed")
// ─────────────────────────────────────────────────────────────

import type { DataChangeCallback, ILogger, IMonitoredSubscription } from '@node-i3x/core';
import type { IAddressSpace, UAVariable } from 'node-opcua-address-space-base';
import { NodeClass } from 'node-opcua-data-model';
import type { DataValue } from 'node-opcua-data-value';
import { coerceNodeId } from 'node-opcua-nodeid';

/**
 * IMonitoredSubscription backed by UAVariable.on("value_changed").
 *
 * Zero-latency: fires the callback synchronously when the
 * variable changes in the AddressSpace — no polling, no
 * network round-trip.
 */
export class AddressSpaceMonitoredSubscription implements IMonitoredSubscription {
  readonly id: string;
  private _cb: DataChangeCallback | null = null;
  private readonly _listeners = new Map<string, () => void>();

  constructor(
    private readonly _addressSpace: IAddressSpace,
    private readonly _logger: ILogger,
  ) {
    this.id = `as-sub-${Date.now()}`;
  }

  async addItems(sourceNodeIds: string[]): Promise<void> {
    for (const nodeId of sourceNodeIds) {
      if (this._listeners.has(nodeId)) continue;

      const node = this._addressSpace.findNode(coerceNodeId(nodeId));
      if (!node || node.nodeClass !== NodeClass.Variable) {
        this._logger.warn(`Cannot monitor ${nodeId}: not a Variable`);
        continue;
      }

      const variable = node as UAVariable;
      const handler = (dataValue: DataValue) => {
        if (!this._cb) return;
        this._cb(
          nodeId,
          dataValue.value?.value,
          dataValue.statusCode?.name ?? 'Good',
          dataValue.sourceTimestamp?.toISOString() ?? new Date().toISOString(),
        );
      };

      variable.on('value_changed', handler);
      this._listeners.set(nodeId, () =>
        variable.removeListener('value_changed', handler),
      );
    }
    this._logger.info(
      `AddressSpace subscription: monitoring ${this._listeners.size} items`,
    );
  }

  async removeItems(sourceNodeIds: string[]): Promise<void> {
    for (const id of sourceNodeIds) {
      const unsub = this._listeners.get(id);
      if (unsub) {
        unsub();
        this._listeners.delete(id);
      }
    }
  }

  onDataChange(cb: DataChangeCallback): void {
    this._cb = cb;
  }

  async close(): Promise<void> {
    for (const unsub of this._listeners.values()) unsub();
    this._listeners.clear();
    this._cb = null;
  }
}
