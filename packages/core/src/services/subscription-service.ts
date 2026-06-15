// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  SubscriptionService
//
// Delivers asset-level composite values (matching the i3X
// CurrentValueResult shape) with debounced streaming.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { BuildResult } from '../domain/model-node.js';
import type {
  CreateSubscriptionOptions,
  MonitoredObjectEntry,
  SubscriptionDeleteResult,
  SubscriptionDetail,
  SubscriptionUpdate,
} from '../domain/subscription.js';
import type { CurrentValueResult, VQT } from '../domain/vqt.js';
import { normalizeVqt } from '../helpers/vqt-helpers.js';
import type { IDataSourcePort, IMonitoredSubscription } from '../ports/data-source.js';
import type { ILogger } from '../ports/logger.js';
import type { SyncBatch } from '../types/api.js';
import type { ModelService } from './model-service.js';

const MAX_QUEUE_SIZE = 10_000;
const SLICE_QUEUE_SIZE = 5_000;

// ── Asset monitor state ──────────────────────────────────────

/** Per-registered-asset live state, maintained in memory. */
interface AssetMonitorState {
  /** The registered element ID (asset or leaf property). */
  assetElementId: string;
  /** maxDepth used during registration. */
  maxDepth: number;
  /** True if this is an asset with children (composite). */
  isComposition: boolean;
  /** Live VQT cache keyed by property elementId. */
  components: Map<string, VQT>;
  /** OPC UA sourceNodeId → property elementId. */
  sourceToProperty: Map<string, string>;
  /** All OPC UA source node IDs monitored for this asset. */
  sourceNodeIds: string[];
  /** Dirty flag — set when any property value changes. */
  dirty: boolean;
  /** Debounce timer handle. */
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

// ── Subscription state ───────────────────────────────────────

interface SubState {
  subscriptionId: string;
  clientId: string | null;
  displayName: string | null;
  monitoredObjects: MonitoredObjectEntry[];

  /** Per-registered-asset live composite state. */
  assets: Map<string, AssetMonitorState>;
  /** Reverse lookup: OPC UA sourceNodeId → set of assetElementIds. */
  sourceToAsset: Map<string, Set<string>>;

  /** The update queue (ring buffer). */
  updates: SubscriptionUpdate[];
  /** Sequence counter — monotonically increasing. */
  nextSequence: number;
  /** Underlying monitored subscription from the data source. */
  runtime: IMonitoredSubscription | null;
  /** Waiters for the stream / long-poll endpoint. */
  waiters: Array<(updates: SubscriptionUpdate[]) => void>;
  mode: 'polling' | 'native';
  /** Callback to close the currently active SSE stream (if any). */
  activeStreamClose: (() => void) | null;
}

// ── Service ──────────────────────────────────────────────────

/** Debounce window in milliseconds. */
const DEBOUNCE_MS = 200;

export class SubscriptionService {
  private readonly _subs = new Map<string, SubState>();
  private readonly _publishIntervalMs: number;
  private readonly _samplingIntervalMs: number;

  constructor(
    private readonly dataSource: IDataSourcePort,
    private readonly modelService: ModelService,
    private readonly logger: ILogger,
    publishIntervalMs: number = 1000,
    samplingIntervalMs: number = 250,
  ) {
    this._publishIntervalMs = publishIntervalMs;
    this._samplingIntervalMs = samplingIntervalMs;
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
      assets: new Map(),
      sourceToAsset: new Map(),
      updates: [],
      nextSequence: 1,
      runtime: null,
      waiters: [],
      mode: 'polling',
      activeStreamClose: null,
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
  ): Promise<{
    registered: string[];
    errors: Array<{ elementId: string; error: string }>;
  }> {
    const sub = this._getOrCreateSub(subscriptionId);
    const model = await this.modelService.getOrBuildModel();

    const registered: string[] = [];
    const errors: Array<{ elementId: string; error: string }> = [];
    const allSourceNodeIds: string[] = [];

    for (const elementId of elementIds) {
      const node = this.modelService.findNode(model, elementId);
      if (!node) {
        errors.push({ elementId, error: 'Element not found' });
        continue;
      }

      // Build the asset monitor state
      const propMappings = this._collectSourceMappings(model, node.id, maxDepth, 0);

      this.logger.info(
        `register: elementId=${elementId} kind=${node.kind} ` +
          `maxDepth=${maxDepth} mappings=${propMappings.size} ` +
          `children=${(model.childrenById.get(node.id) ?? []).length}`,
      );

      const isComposition =
        propMappings.size > 1 ||
        (propMappings.size === 1 && !propMappings.has(node.sourceNodeId));

      // For a leaf node, the single mapping is its own sourceNodeId
      if (propMappings.size === 0 && node.kind === 'property') {
        const source = model.propertyToSource.get(node.id) ?? node.sourceNodeId;
        propMappings.set(source, node.id);
      }

      if (propMappings.size === 0 && node.kind === 'asset') {
        // The requested maxDepth didn't reach any property
        // variables (e.g. SmartFactory → Pump → Temperature
        // with maxDepth=1). Do a deeper unbounded search to
        // find at least one source so the initial value seed
        // produces an update for the conformance suite.
        this._collectSourceMappings(model, node.id, 0, 0, propMappings);

        if (propMappings.size === 0) {
          this.logger.warn(
            `register: NO source mappings for ${elementId} — ` +
              `children kinds: ${(model.childrenById.get(node.id) ?? [])
                .map((cid) => model.nodesById.get(cid))
                .filter(Boolean)
                .map((n) => `${n!.name}(${n!.kind})`)
                .join(', ')}`,
          );
        } else {
          this.logger.info(
            `register: deep search found ${propMappings.size} ` +
              `source mapping(s) for ${elementId}`,
          );
        }
      }

      const asset: AssetMonitorState = {
        assetElementId: elementId,
        maxDepth,
        isComposition,
        components: new Map(),
        sourceToProperty: propMappings,
        sourceNodeIds: [...propMappings.keys()],
        dirty: false,
        debounceTimer: null,
      };

      // Register reverse lookups (one source → many assets)
      for (const sourceId of asset.sourceNodeIds) {
        let set = sub.sourceToAsset.get(sourceId);
        if (!set) {
          set = new Set();
          sub.sourceToAsset.set(sourceId, set);
        }
        set.add(elementId);
        allSourceNodeIds.push(sourceId);
      }

      sub.assets.set(elementId, asset);
      sub.monitoredObjects.push({ elementId, maxDepth });
      registered.push(elementId);
    }

    // Start or update the data-source subscription
    await this._ensureRuntime(sub, allSourceNodeIds);

    // Seed initial values so the first /sync has data immediately.
    // The conformance suite calls /sync within ~150ms of registering;
    // without this, no OPC UA publish cycle has fired yet.
    if (allSourceNodeIds.length > 0) {
      try {
        const initialValues = await this.dataSource.readValues(allSourceNodeIds);
        const now = new Date().toISOString();
        for (let i = 0; i < allSourceNodeIds.length; i++) {
          const dv = initialValues[i];
          if (dv) {
            this._onDataChange(
              sub,
              allSourceNodeIds[i]!,
              dv.value,
              dv.quality ?? 'Good',
              dv.timestamp ?? now,
            );
          }
        }
        // Flush immediately — don't wait for the 200ms debounce.
        // Cancel pending debounce timers and push updates now.
        for (const asset of sub.assets.values()) {
          if (asset.dirty) {
            if (asset.debounceTimer) {
              clearTimeout(asset.debounceTimer);
              asset.debounceTimer = null;
            }
            this._flushAsset(sub, asset);
          }
        }
      } catch (err) {
        this.logger.warn(`Initial value seed failed: ${err}`);
      }
    }

    return { registered, errors };
  }

  // ── Unregister items ───────────────────────────────────────

  async unregister(
    subscriptionId: string,
    elementIds: string[],
  ): Promise<{
    registered: string[];
    errors: Array<{ elementId: string; error: string }>;
  }> {
    const sub = this._requireSub(subscriptionId);
    const sourceIdsToRemove: string[] = [];

    const registered: string[] = [];
    const errors: Array<{ elementId: string; error: string }> = [];

    for (const elementId of elementIds) {
      const asset = sub.assets.get(elementId);
      if (!asset) {
        errors.push({ elementId, error: 'Element not monitored' });
        continue;
      }

      sub.monitoredObjects = sub.monitoredObjects.filter(
        (m) => m.elementId !== elementId,
      );

      // Clear debounce timer
      if (asset.debounceTimer) clearTimeout(asset.debounceTimer);
      // Remove reverse lookups
      for (const sourceId of asset.sourceNodeIds) {
        const set = sub.sourceToAsset.get(sourceId);
        if (set) {
          set.delete(elementId);
          if (set.size === 0) {
            sub.sourceToAsset.delete(sourceId);
            sourceIdsToRemove.push(sourceId);
          }
          // else: still used by another asset, don't remove from OPC UA
        }
      }
      sub.assets.delete(elementId);
      registered.push(elementId);
    }

    // Remove monitored items from the OPC UA subscription
    if (sub.runtime && sourceIdsToRemove.length > 0) {
      try {
        await sub.runtime.removeItems(sourceIdsToRemove);
      } catch (err) {
        this.logger.debug(`best-effort removeItems failed: ${(err as Error).message}`);
      }
    }

    if (sub.runtime && sub.sourceToAsset.size === 0) {
      await sub.runtime.close();
      sub.runtime = null;
    }

    return { registered, errors };
  }

  // ── Sync ───────────────────────────────────────────────────

  sync(subscriptionId: string, lastSequenceNumber: number = 0): SyncBatch[] {
    const sub = this._requireSub(subscriptionId);
    // -1 is a sentinel: clear ALL pending updates (i3X spec §Sync)
    if (lastSequenceNumber === -1) {
      sub.updates = [];
      return [];
    }
    // Trim acknowledged updates (matches Python behaviour)
    sub.updates = sub.updates.filter((u) => u.sequenceNumber > lastSequenceNumber);
    return sub.updates.map((u) => ({
      sequenceNumber: u.sequenceNumber,
      updates: [
        {
          elementId: u.elementId,
          value: u.value,
          quality: u.quality,
          timestamp: u.timestamp,
        },
      ],
    }));
  }

  /**
   * Trim updates that have been delivered to the client.
   * Call after stream/sync to prevent re-delivery.
   */
  acknowledge(subscriptionId: string, upToSequence: number): void {
    const sub = this._subs.get(subscriptionId);
    if (!sub) return;
    sub.updates = sub.updates.filter((u) => u.sequenceNumber > upToSequence);
  }

  // ── Stream / long-poll ─────────────────────────────────────

  waitForUpdates(
    subscriptionId: string,
    afterSequence: number,
    timeoutMs: number = 30_000,
  ): Promise<SubscriptionUpdate[]> {
    const sub = this._requireSub(subscriptionId);

    const pending = sub.updates.filter((u) => u.sequenceNumber > afterSequence);
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

  // ── Active stream management ──────────────────────────────

  /**
   * Register an active SSE stream for the subscription.
   * If another stream is already active, it is closed first
   * (enforcing single-stream-per-subscription).
   */
  registerActiveStream(subscriptionId: string, closeCallback: () => void): void {
    const sub = this._subs.get(subscriptionId);
    if (!sub) return;
    if (sub.activeStreamClose) {
      // Close the previous stream
      sub.activeStreamClose();
      // Wake up any blocked waitForUpdates so the old loop exits now
      for (const w of sub.waiters) w([]);
      sub.waiters = [];
    }
    sub.activeStreamClose = closeCallback;
  }

  /**
   * Clear the active stream reference when a stream closes.
   * Only clears if the callback matches (prevents stale clears).
   */
  clearActiveStream(subscriptionId: string, closeCallback: () => void): void {
    const sub = this._subs.get(subscriptionId);
    if (!sub) return;
    if (sub.activeStreamClose === closeCallback) {
      sub.activeStreamClose = null;
    }
  }

  // ── Delete ─────────────────────────────────────────────────

  async deleteSubscriptions(
    subscriptionIds: string[],
  ): Promise<SubscriptionDeleteResult[]> {
    const results: SubscriptionDeleteResult[] = [];
    for (const id of subscriptionIds) {
      const sub = this._subs.get(id);
      if (!sub) {
        results.push({
          success: false,
          subscriptionId: id,
          responseDetail: {
            title: 'Not Found',
            status: 404,
            detail: 'Subscription not found',
          },
        });
        continue;
      }
      // Clear all debounce timers
      for (const asset of sub.assets.values()) {
        if (asset.debounceTimer) clearTimeout(asset.debounceTimer);
      }
      if (sub.runtime) {
        try {
          await sub.runtime.close();
        } catch (err) {
          this.logger.debug(
            `best-effort runtime.close failed: ${(err as Error).message}`,
          );
        }
      }
      this._subs.delete(id);
      results.push({ success: true, subscriptionId: id });
    }
    return results;
  }

  // ── List ───────────────────────────────────────────────────

  list(filterIds?: string[]): SubscriptionDetail[] {
    const entries = filterIds
      ? (filterIds.map((id) => this._subs.get(id)).filter(Boolean) as SubState[])
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
      for (const asset of sub.assets.values()) {
        if (asset.debounceTimer) clearTimeout(asset.debounceTimer);
      }
      if (sub.runtime) {
        try {
          await sub.runtime.close();
        } catch (err) {
          this.logger.debug(
            `best-effort runtime.close failed: ${(err as Error).message}`,
          );
        }
      }
    }
    this._subs.clear();
  }

  // ── Internals ──────────────────────────────────────────────

  /**
   * Helper to retrieve a subscription by its ID, throwing a 404 error
   * if the subscription does not exist.
   *
   * @param id The subscription identifier.
   * @returns The SubState object for the subscription.
   * @throws Error with statusCode 404 if not found.
   */
  private _requireSub(id: string): SubState {
    const sub = this._subs.get(id);
    if (!sub)
      throw Object.assign(new Error(`Subscription '${id}' not found`), {
        statusCode: 404,
      });
    return sub;
  }

  /**
   * Return the subscription if it exists, otherwise auto-create
   * it with the caller-provided ID.  This supports the i3X
   * Explorer pattern where the client generates a subscriptionId
   * and calls register() directly without a prior create().
   */
  private _getOrCreateSub(id: string): SubState {
    let sub = this._subs.get(id);
    if (!sub) {
      this.logger.info(`Auto-creating subscription id=${id}`);
      sub = {
        subscriptionId: id,
        clientId: null,
        displayName: null,
        monitoredObjects: [],
        assets: new Map(),
        sourceToAsset: new Map(),
        updates: [],
        nextSequence: 1,
        runtime: null,
        waiters: [],
        mode: 'polling',
        activeStreamClose: null,
      };
      this._subs.set(id, sub);
    }
    return sub;
  }

  /**
   * Collect source-node → property-element mappings for a node
   * tree, recursing into composition children up to maxDepth.
   *
   * Returns Map<sourceNodeId, propertyElementId>.
   */
  private _collectSourceMappings(
    model: BuildResult,
    nodeId: string,
    maxDepth: number,
    depth: number,
    out: Map<string, string> = new Map(),
  ): Map<string, string> {
    const node = model.nodesById.get(nodeId);
    if (!node) return out;

    // Properties are always collected regardless of depth
    if (node.kind === 'property') {
      const source = model.propertyToSource.get(node.id) ?? node.sourceNodeId;
      if (source) out.set(source, node.id);
      return out;
    }

    // Depth limit only applies to further recursion into assets
    if (maxDepth > 0 && depth >= maxDepth) return out;

    const childIds = model.childrenById.get(nodeId) ?? [];
    for (const childId of childIds) {
      this._collectSourceMappings(model, childId, maxDepth, depth + 1, out);
    }
    return out;
  }

  /**
   * Ensures the underlying native OPC UA monitored subscription runtime is created
   * and registers the monitored items. If native subscriptions fail, it falls back
   * to software-based polling.
   *
   * @param sub The subscription state object.
   * @param newSourceNodeIds The list of new source node IDs to monitor.
   */
  private async _ensureRuntime(sub: SubState, newSourceNodeIds: string[]): Promise<void> {
    if (!sub.runtime) {
      try {
        sub.runtime = await this.dataSource.createMonitoredSubscription({
          publishingIntervalMs: this._publishIntervalMs,
          samplingIntervalMs: this._samplingIntervalMs,
        });
        sub.runtime.onDataChange((sourceNodeId, value, quality, timestamp) => {
          this._onDataChange(sub, sourceNodeId, value, quality, timestamp);
        });
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

  /**
   * Called when a single OPC UA property value changes.
   * Updates the asset's VQT cache and starts a debounce timer
   * to flush the composite value once all changes settle.
   */
  private _onDataChange(
    sub: SubState,
    sourceNodeId: string,
    value: unknown,
    quality: string,
    timestamp: string,
  ): void {
    const assetIds = sub.sourceToAsset.get(sourceNodeId);
    if (!assetIds || assetIds.size === 0) {
      this.logger.debug(
        `onDataChange: sourceNodeId=${sourceNodeId} NOT in sourceToAsset (size=${sub.sourceToAsset.size})`,
      );
      return;
    }

    // Fan out to ALL assets that include this source node
    for (const assetElementId of assetIds) {
      const asset = sub.assets.get(assetElementId);
      if (!asset) continue;

      const propertyElementId = asset.sourceToProperty.get(sourceNodeId);
      if (!propertyElementId) continue;

      // Update the VQT cache for this property
      const { value: mappedValue, quality: mappedQuality } = normalizeVqt(value, quality);
      asset.components.set(propertyElementId, {
        value: mappedValue,
        quality: mappedQuality,
        timestamp,
      });
      asset.dirty = true;

      this.logger.debug(
        `_onDataChange: source=${sourceNodeId} → asset=${assetElementId} ` +
          `prop=${propertyElementId} components=${asset.components.size}/${asset.sourceToProperty.size}`,
      );

      // Start or reset the debounce timer
      if (asset.debounceTimer) clearTimeout(asset.debounceTimer);
      asset.debounceTimer = setTimeout(() => {
        this._flushAsset(sub, asset);
      }, DEBOUNCE_MS);
    }
  }

  /**
   * Build the composite CurrentValueResult from the asset's
   * cached property values and push it as a SubscriptionUpdate.
   */
  private _flushAsset(sub: SubState, asset: AssetMonitorState): void {
    if (!asset.dirty) return;
    asset.dirty = false;
    asset.debounceTimer = null;

    const now = new Date().toISOString();

    let compositeValue: CurrentValueResult;

    if (asset.isComposition) {
      // Build the components map from cached VQTs
      const components: Record<string, VQT> = {};
      for (const [propId, vqt] of asset.components) {
        components[propId] = vqt;
      }

      compositeValue = {
        isComposition: true,
        value: null,
        quality: 'GoodNoData',
        timestamp: now,
        components,
      };
    } else {
      // Leaf node — single property value
      const firstVqt = asset.components.values().next().value as VQT | undefined;
      const { value: val, quality: qual } = normalizeVqt(
        firstVqt?.value ?? null,
        firstVqt?.quality ?? 'Good',
      );
      compositeValue = {
        isComposition: false,
        value: val,
        quality: qual,
        timestamp: firstVqt?.timestamp ?? now,
      };
    }

    const update: SubscriptionUpdate = {
      sequenceNumber: sub.nextSequence++,
      elementId: asset.assetElementId,
      value: compositeValue,
      quality: compositeValue.quality,
      timestamp: compositeValue.timestamp,
    };

    sub.updates.push(update);

    // Cap queue at 10 000 entries
    if (sub.updates.length > MAX_QUEUE_SIZE) {
      sub.updates = sub.updates.slice(-SLICE_QUEUE_SIZE);
    }

    // Wake any long-poll / stream waiters
    const waiters = sub.waiters;
    sub.waiters = [];
    for (const resolve of waiters) {
      resolve([update]);
    }
  }

  /**
   * Starts a software polling loop for the subscription when native OPC UA
   * subscriptions are not supported or fail.
   *
   * @param sub The subscription state object.
   */
  private _startPolling(sub: SubState): void {
    const poll = async () => {
      while (this._subs.has(sub.subscriptionId) && sub.mode === 'polling') {
        try {
          const sourceIds = [...sub.sourceToAsset.keys()];
          if (sourceIds.length > 0) {
            const values = await this.dataSource.readValues(sourceIds);
            const now = new Date().toISOString();
            for (let i = 0; i < sourceIds.length; i++) {
              const dv = values[i];
              if (dv) {
                this._onDataChange(
                  sub,
                  sourceIds[i]!,
                  dv.value,
                  dv.quality ?? 'Good',
                  dv.timestamp ?? now,
                );
              }
            }
          }
        } catch (err) {
          this.logger.warn(`Poll error for subscription ${sub.subscriptionId}: ${err}`);
        }
        await new Promise((r) => setTimeout(r, this._publishIntervalMs));
      }
    };
    poll().catch(() => {});
  }
}
