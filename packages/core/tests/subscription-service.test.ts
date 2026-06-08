// ─────────────────────────────────────────────────────────────
// @i3x/core — SubscriptionService unit tests
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionService } from '../src/services/subscription-service.js';
import { ModelService, emptyBuildResult } from '../src/services/model-service.js';
import { nullLogger } from '../src/ports/logger.js';
import type {
  IDataSourcePort,
  IMonitoredSubscription,
  SourceNodeInfo,
  SourceDataValue,
  SourceHistoricalValue,
  NamespaceInfo,
  ObjectTypeInfo,
  MonitoredSubscriptionOptions,
  DataChangeCallback,
} from '../src/ports/data-source.js';

// ── Mock data source ─────────────────────────────────────────

function createMockDataSource(): IDataSourcePort & {
  _triggerChange: (nodeId: string, value: unknown) => void;
  _monitoredNodeIds: string[];
  _subscriptionCreated: boolean;
  _fail: boolean;
} {
  let changeCb: DataChangeCallback | null = null;
  const monitoredNodeIds: string[] = [];
  let subscriptionCreated = false;
  let fail = false;

  const mockSub: IMonitoredSubscription = {
    id: 'mock-sub-1',
    async addItems(ids: string[]) {
      monitoredNodeIds.push(...ids);
    },
    async removeItems(ids: string[]) {
      for (const id of ids) {
        const idx = monitoredNodeIds.indexOf(id);
        if (idx >= 0) monitoredNodeIds.splice(idx, 1);
      }
    },
    onDataChange(cb: DataChangeCallback) {
      changeCb = cb;
    },
    async close() {
      changeCb = null;
    },
  };

  const sourceNodes: SourceNodeInfo[] = [
    // Root object: CNC Machine
    {
      sourceNodeId: 'ns=1;i=100',
      parentSourceNodeId: null,
      browseName: 'CncMachine',
      displayName: 'CNC Machine',
      nodeClass: 'Object',
      dataType: null,
      eventNotifier: false,
    },
    // Property: Temperature
    {
      sourceNodeId: 'ns=1;i=101',
      parentSourceNodeId: 'ns=1;i=100',
      browseName: 'Temperature',
      displayName: 'Temperature',
      nodeClass: 'Variable',
      dataType: 'Double',
      eventNotifier: false,
    },
    // Property: Speed
    {
      sourceNodeId: 'ns=1;i=102',
      parentSourceNodeId: 'ns=1;i=100',
      browseName: 'Speed',
      displayName: 'Speed',
      nodeClass: 'Variable',
      dataType: 'Int32',
      eventNotifier: false,
    },
    // Nested object: Spindle
    {
      sourceNodeId: 'ns=1;i=200',
      parentSourceNodeId: 'ns=1;i=100',
      browseName: 'Spindle',
      displayName: 'Spindle',
      nodeClass: 'Object',
      dataType: null,
      eventNotifier: false,
    },
    // Nested property: Spindle.RPM
    {
      sourceNodeId: 'ns=1;i=201',
      parentSourceNodeId: 'ns=1;i=200',
      browseName: 'RPM',
      displayName: 'RPM',
      nodeClass: 'Variable',
      dataType: 'Double',
      eventNotifier: false,
    },
  ];

  return {
    get _monitoredNodeIds() { return monitoredNodeIds; },
    get _subscriptionCreated() { return subscriptionCreated; },
    set _fail(v: boolean) { fail = v; },
    _triggerChange(nodeId: string, value: unknown) {
      if (changeCb) {
        changeCb(nodeId, value, 'Good', new Date().toISOString());
      }
    },

    async connect() {},
    async disconnect() {},
    isConnected() { return true; },
    async browseTree(): Promise<SourceNodeInfo[]> {
      return sourceNodes;
    },
    async getNamespaces(): Promise<NamespaceInfo[]> { return []; },
    async getObjectTypes(): Promise<ObjectTypeInfo[]> { return []; },
    async readValue(id: string): Promise<SourceDataValue> {
      return { value: 42, quality: 'Good', timestamp: new Date().toISOString() };
    },
    async readValues(ids: string[]): Promise<SourceDataValue[]> {
      return ids.map(() => ({
        value: 42, quality: 'Good', timestamp: new Date().toISOString(),
      }));
    },
    async writeValue() {},
    async readHistory(): Promise<SourceHistoricalValue[]> { return []; },
    async createMonitoredSubscription(
      opts: MonitoredSubscriptionOptions,
    ): Promise<IMonitoredSubscription> {
      if (fail) throw new Error('Subscription creation failed');
      subscriptionCreated = true;
      return mockSub;
    },
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('SubscriptionService', () => {
  let ds: ReturnType<typeof createMockDataSource>;
  let modelService: ModelService;
  let svc: SubscriptionService;

  beforeEach(async () => {
    ds = createMockDataSource();
    modelService = new ModelService(ds, nullLogger);
    await modelService.preloadModel();
    svc = new SubscriptionService(ds, modelService, nullLogger, 1);
  });

  // ── Create ─────────────────────────────────────────────

  it('create() returns a new subscription with UUID', () => {
    const result = svc.create({ clientId: 'test', displayName: 'My Sub' });
    expect(result.subscriptionId).toBeTruthy();
    expect(result.clientId).toBe('test');
    expect(result.displayName).toBe('My Sub');
  });

  it('create() with no options uses null defaults', () => {
    const result = svc.create();
    expect(result.clientId).toBeNull();
    expect(result.displayName).toBeNull();
  });

  // ── Register ───────────────────────────────────────────

  it('register() creates OPC UA subscription on first call', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;

    expect(ds._subscriptionCreated).toBe(false);
    await svc.register(subscriptionId, [propId], 1);
    expect(ds._subscriptionCreated).toBe(true);
  });

  it('register() adds monitored items for property nodes', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;

    await svc.register(subscriptionId, [propId], 1);
    expect(ds._monitoredNodeIds.length).toBeGreaterThan(0);
  });

  it('register() resolves asset children at maxDepth=1', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();

    // Find the CNC Machine asset (root node)
    const cncNode = [...model.nodesById.values()].find(
      (n) => n.name === 'CNC Machine',
    );
    expect(cncNode).toBeTruthy();

    await svc.register(subscriptionId, [cncNode!.id], 1);
    // Should have resolved Temperature + Speed as monitored items
    // (maxDepth=1 means direct children only)
    expect(ds._monitoredNodeIds.length).toBeGreaterThanOrEqual(2);
  });

  it('register() returns errors for unknown elementIds', async () => {
    const { subscriptionId } = svc.create();
    const { registered, errors } = await svc.register(
      subscriptionId, ['nonexistent-id'], 1,
    );
    expect(registered).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.elementId).toBe('nonexistent-id');
  });

  it('register() throws for unknown subscriptionId', async () => {
    await expect(
      svc.register('bad-id', ['anything'], 1),
    ).rejects.toThrow(/not found/i);
  });

  // ── Data changes + sequence numbers ────────────────────

  it('data changes produce sequenced updates', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);

    // Simulate 3 data changes
    ds._triggerChange(sourceId, 10.0);
    ds._triggerChange(sourceId, 20.0);
    ds._triggerChange(sourceId, 30.0);

    const updates = svc.sync(subscriptionId, 0);
    expect(updates).toHaveLength(3);
    expect(updates[0]!.sequenceNumber).toBe(1);
    expect(updates[1]!.sequenceNumber).toBe(2);
    expect(updates[2]!.sequenceNumber).toBe(3);
    expect(updates[0]!.value).toBe(10.0);
    expect(updates[2]!.value).toBe(30.0);
  });

  it('data changes include correct elementId mapping', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);
    ds._triggerChange(sourceId, 42);

    const updates = svc.sync(subscriptionId, 0);
    expect(updates[0]!.elementId).toBe(propId);
    expect(updates[0]!.nodeId).toBe(sourceId);
  });

  // ── Sync with acknowledgeSequence ──────────────────────

  it('sync() filters by acknowledgeSequence', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);

    ds._triggerChange(sourceId, 1);
    ds._triggerChange(sourceId, 2);
    ds._triggerChange(sourceId, 3);

    // Acknowledge up to seq 2 → only seq 3 returned
    const updates = svc.sync(subscriptionId, 2);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.sequenceNumber).toBe(3);
  });

  it('sync() returns empty array when fully acknowledged', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);
    ds._triggerChange(sourceId, 1);

    const updates = svc.sync(subscriptionId, 1);
    expect(updates).toHaveLength(0);
  });

  // ── waitForUpdates (long-poll) ─────────────────────────

  it('waitForUpdates resolves immediately if updates pending', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);
    ds._triggerChange(sourceId, 99);

    const updates = await svc.waitForUpdates(subscriptionId, 0, 1000);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.value).toBe(99);
  });

  it('waitForUpdates waits for future update', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);

    // Start waiting, then trigger change after 50ms
    const promise = svc.waitForUpdates(subscriptionId, 0, 5000);
    setTimeout(() => ds._triggerChange(sourceId, 77), 50);

    const updates = await promise;
    expect(updates).toHaveLength(1);
    expect(updates[0]!.value).toBe(77);
  });

  it('waitForUpdates times out with empty array', async () => {
    const { subscriptionId } = svc.create();
    const updates = await svc.waitForUpdates(subscriptionId, 0, 50);
    expect(updates).toHaveLength(0);
  });

  // ── Queue cap ──────────────────────────────────────────

  it('queue caps at 10,000 entries', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);

    // Push 10,001 changes
    for (let i = 0; i < 10_001; i++) {
      ds._triggerChange(sourceId, i);
    }

    const all = svc.sync(subscriptionId, 0);
    // After cap, should be trimmed to ~5000
    expect(all.length).toBeLessThanOrEqual(10_000);
    expect(all.length).toBeGreaterThanOrEqual(5_000);
  });

  // ── Delete ─────────────────────────────────────────────

  it('deleteSubscriptions removes subscription', async () => {
    const { subscriptionId } = svc.create();
    const results = await svc.deleteSubscriptions([subscriptionId]);
    expect(results[0]!.success).toBe(true);

    // Sync should throw
    expect(() => svc.sync(subscriptionId, 0)).toThrow(/not found/i);
  });

  it('deleteSubscriptions returns error for unknown id', async () => {
    const results = await svc.deleteSubscriptions(['unknown']);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error!.code).toBe(404);
  });

  // ── List ───────────────────────────────────────────────

  it('list() returns all subscriptions', () => {
    svc.create({ clientId: 'a' });
    svc.create({ clientId: 'b' });
    const all = svc.list();
    expect(all).toHaveLength(2);
  });

  it('list() filters by subscriptionIds', () => {
    const { subscriptionId: id1 } = svc.create({ clientId: 'a' });
    svc.create({ clientId: 'b' });
    const filtered = svc.list([id1]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.clientId).toBe('a');
  });

  // ── Polling fallback ───────────────────────────────────

  it('falls back to polling when subscription creation fails', async () => {
    ds._fail = true;
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;

    await svc.register(subscriptionId, [propId], 1);

    const details = svc.list([subscriptionId]);
    expect(details[0]!.mode).toBe('polling');
  });

  // ── Unregister ─────────────────────────────────────────

  it('unregister() removes items and cleans up', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);
    await svc.unregister(subscriptionId, [propId]);

    // Data changes after unregister should be ignored
    ds._triggerChange(sourceId, 999);
    const updates = svc.sync(subscriptionId, 0);
    expect(updates).toHaveLength(0);
  });

  // ── Close ──────────────────────────────────────────────

  it('close() clears all subscriptions', async () => {
    svc.create();
    svc.create();
    await svc.close();
    expect(svc.list()).toHaveLength(0);
  });
});
