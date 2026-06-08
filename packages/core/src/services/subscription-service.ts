// ─────────────────────────────────────────────────────────────
// @i3x/core  —  SubscriptionService
// ─────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { BuildResult } from '../domain/model-node.js';
import type {
  SubscriptionUpdate,
  SubscriptionDetail,
  SubscriptionDeleteResult,
  MonitoredObjectEntry,
  CreateSubscriptionOptions,
} from '../domain/subscription.js';
import type {
  IDataSourcePort,
  IMonitoredSubscription,
} from '../ports/data-source.js';
import type { ILogger } from '../ports/logger.js';
import type { ModelService } from './model-service.js';

// ── Internal state ───────────────────────────────────────────

interface SubState {
  subscriptionId: string;
  clientId: string | null;
  displayName: string | null;
  monitoredObjects: MonitoredObjectEntry[];
  /** Resolved source node IDs → element IDs mapping */
  sourceToElement: Map<string, string>;
  /** The update queue (ring buffer). */
  updates: SubscriptionUpdate[];
  /** Sequence counter — monotonically increasing. */
  nextSequence: number;
  /** Underlying monitored subscription from the data source. */
  runtime: IMonitoredSubscription | null;
  /** Waiters for the stream / long-poll endpoint. */
  waiters: Array<(updates: SubscriptionUpdate[]) => void>;
  mode: 'polling' | 'native';
}

// ── Service ──────────────────────────────────────────────────

export class SubscriptionService {
  private readonly _subs = new Map<string, SubState>();
  private readonly _intervalMs: number;

  constructor(
    private readonly dataSource: IDataSourcePort,
    private readonly modelService: ModelService,
    private readonly logger: ILogger,
    intervalSeconds: number = 5,
  ) {
    this._intervalMs = intervalSeconds * 1000;
  }

  // ── Create ─────────────────────────────────────────────────

  create(opts: CreateSubscriptionOptions = {}): {
    subscriptionId: string;
    clientId: string | null;
    displayName: string | null;
  } {
    const subscriptionId = randomUUID();
    const state: SubState = {
      subscriptionId,
      clientId: opts.clientId ?? null,
      displayName: opts.displayName ?? null,
      monitoredObjects: [],
      sourceToElement: new Map(),
      updates: [],
      nextSequence: 1,
      runtime: null,
      waiters: [],
      mode: 'polling',
    };
    this._subs.set(subscriptionId, state);
    this.logger.info(`Subscription created id=${subscriptionId}`);
    return { subscriptionId, clientId: state.clientId, displayName: state.displayName };
  }

  // ── Register items ─────────────────────────────────────────

  async register(
    subscriptionId: string,
    elementIds: string[],
    maxDepth: number = 1,
  ): Promise<{ registered: string[]; errors: Array<{ elementId: string; error: string }> }> {
    const sub = this._requireSub(subscriptionId);
    const model = await this.modelService.getOrBuildModel();

    const registered: string[] = [];
    const errors: Array<{ elementId: string; error: string }> = [];
    const sourceNodeIds: string[] = [];

    for (const elementId of elementIds) {
      const node = this.modelService.findNode(model, elementId);
      if (!node) {
        errors.push({ elementId, error: 'Element not found' });
        continue;
      }

      // Collect this node + property children
      const ids = this._collectPropertyIds(model, node.id, maxDepth, 0);
      for (const propId of ids) {
        const source = model.propertyToSource.get(propId);
        if (source) {
          sub.sourceToElement.set(source, propId);
          sourceNodeIds.push(source);
        }
      }

      sub.monitoredObjects.push({ elementId, maxDepth });
      registered.push(elementId);
    }

    // Start or update the data-source subscription
    await this._ensureRuntime(sub, sourceNodeIds);
    return { registered, errors };
  }

  // ── Unregister items ───────────────────────────────────────

  async unregister(
    subscriptionId: string,
    elementIds: string[],
  ): Promise<void> {
    const sub = this._requireSub(subscriptionId);
    const model = await this.modelService.getOrBuildModel();

    for (const elementId of elementIds) {
      sub.monitoredObjects = sub.monitoredObjects.filter(
        (m) => m.elementId !== elementId,
      );

      // Remove source mappings for this element's properties
      const node = this.modelService.findNode(model, elementId);
      if (node) {
        const ids = this._collectPropertyIds(model, node.id, 10, 0);
        for (const propId of ids) {
          const source = model.propertyToSource.get(propId);
          if (source) sub.sourceToElement.delete(source);
        }
      }
    }

    if (sub.runtime && sub.sourceToElement.size === 0) {
      await sub.runtime.close();
      sub.runtime = null;
    }
  }

  // ── Sync ───────────────────────────────────────────────────

  sync(
    subscriptionId: string,
    acknowledgeSequence: number = 0,
  ): SubscriptionUpdate[] {
    const sub = this._requireSub(subscriptionId);
    return sub.updates.filter((u) => u.sequenceNumber > acknowledgeSequence);
  }

  // ── Stream / long-poll ─────────────────────────────────────

  waitForUpdates(
    subscriptionId: string,
    afterSequence: number,
    timeoutMs: number = 30_000,
  ): Promise<SubscriptionUpdate[]> {
    const sub = this._requireSub(subscriptionId);

    const pending = sub.updates.filter(
      (u) => u.sequenceNumber > afterSequence,
    );
    if (pending.length > 0) return Promise.resolve(pending);

    return new Promise<SubscriptionUpdate[]>((resolve) => {
      let settled = false;

      const settle = (updates: SubscriptionUpdate[]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sub.waiters = sub.waiters.filter((w) => w !== settle);
        resolve(updates);
      };

      const timer = setTimeout(() => settle([]), timeoutMs);
      sub.waiters.push(settle);
    });
  }

  // ── Delete ─────────────────────────────────────────────────

  async deleteSubscriptions(
    subscriptionIds: string[],
  ): Promise<SubscriptionDeleteResult[]> {
    const results: SubscriptionDeleteResult[] = [];
    for (const id of subscriptionIds) {
      const sub = this._subs.get(id);
      if (!sub) {
        results.push({ success: false, subscriptionId: id,
          error: { code: 404, message: 'Subscription not found' } });
        continue;
      }
      if (sub.runtime) {
        try { await sub.runtime.close(); } catch { /* best effort */ }
      }
      this._subs.delete(id);
      results.push({ success: true, subscriptionId: id });
    }
    return results;
  }

  // ── List ───────────────────────────────────────────────────

  list(filterIds?: string[]): SubscriptionDetail[] {
    const entries = filterIds
      ? filterIds.map((id) => this._subs.get(id)).filter(Boolean) as SubState[]
      : [...this._subs.values()];

    return entries.map((s) => ({
      subscriptionId: s.subscriptionId,
      clientId: s.clientId,
      displayName: s.displayName,
      monitoredObjects: [...s.monitoredObjects],
      mode: s.mode,
    }));
  }

  // ── Shutdown ───────────────────────────────────────────────

  async close(): Promise<void> {
    for (const sub of this._subs.values()) {
      if (sub.runtime) {
        try { await sub.runtime.close(); } catch { /* best effort */ }
      }
    }
    this._subs.clear();
  }

  // ── Internals ──────────────────────────────────────────────

  private _requireSub(id: string): SubState {
    const sub = this._subs.get(id);
    if (!sub) throw Object.assign(
      new Error(`Subscription '${id}' not found`), { statusCode: 404 },
    );
    return sub;
  }

  private _collectPropertyIds(
    model: BuildResult, nodeId: string,
    maxDepth: number, depth: number,
    out: string[] = [],
  ): string[] {
    const node = model.nodesById.get(nodeId);
    if (!node) return out;

    // Properties are always collected regardless of depth
    if (node.kind === 'property') { out.push(node.id); return out; }

    // Depth limit only applies to further recursion into assets
    if (maxDepth > 0 && depth >= maxDepth) return out;

    const childIds = model.childrenById.get(nodeId) ?? [];
    for (const childId of childIds) {
      this._collectPropertyIds(model, childId, maxDepth, depth + 1, out);
    }
    return out;
  }

  private async _ensureRuntime(
    sub: SubState,
    newSourceNodeIds: string[],
  ): Promise<void> {
    if (!sub.runtime) {
      try {
        sub.runtime = await this.dataSource.createMonitoredSubscription({
          publishingIntervalMs: this._intervalMs,
        });
        sub.runtime.onDataChange(
          (sourceNodeId, value, quality, timestamp) => {
            this._onDataChange(sub, sourceNodeId, value, quality, timestamp);
          },
        );
        sub.mode = 'native';
      } catch (err) {
        // Fallback to polling — the adapter doesn't support subscriptions
        this.logger.warn(
          `Native subscription failed for ${sub.subscriptionId}, ` +
          `falling back to polling: ${err}`,
        );
        sub.mode = 'polling';
        this._startPolling(sub);
        return;
      }
    }
    if (sub.runtime && newSourceNodeIds.length > 0) {
      await sub.runtime.addItems(newSourceNodeIds);
    }
  }

  private _onDataChange(
    sub: SubState,
    sourceNodeId: string,
    value: unknown,
    quality: string,
    timestamp: string,
  ): void {
    const elementId = sub.sourceToElement.get(sourceNodeId);
    if (!elementId) return;

    const update: SubscriptionUpdate = {
      sequenceNumber: sub.nextSequence++,
      elementId,
      nodeId: sourceNodeId,
      value,
      quality,
      timestamp,
    };
    sub.updates.push(update);

    // Cap queue at 10 000 entries
    if (sub.updates.length > 10_000) {
      sub.updates = sub.updates.slice(-5_000);
    }

    // Wake any long-poll waiters
    const waiters = sub.waiters;
    sub.waiters = [];
    for (const resolve of waiters) {
      resolve([update]);
    }
  }

  private _startPolling(sub: SubState): void {
    const poll = async () => {
      while (this._subs.has(sub.subscriptionId) && sub.mode === 'polling') {
        try {
          const sourceIds = [...sub.sourceToElement.keys()];
          if (sourceIds.length > 0) {
            const values = await this.dataSource.readValues(sourceIds);
            const now = new Date().toISOString();
            for (let i = 0; i < sourceIds.length; i++) {
              const dv = values[i];
              if (dv) {
                this._onDataChange(
                  sub, sourceIds[i]!, dv.value, dv.quality ?? 'Good', dv.timestamp ?? now,
                );
              }
            }
          }
        } catch (err) {
          this.logger.warn(`Poll error for subscription ${sub.subscriptionId}: ${err}`);
        }
        await new Promise((r) => setTimeout(r, this._intervalMs));
      }
    };
    poll().catch(() => {});
  }
}
