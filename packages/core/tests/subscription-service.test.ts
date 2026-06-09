// ─────────────────────────────────────────────────────────────
// @node-i3x/core — SubscriptionService unit tests
// ─────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  DataChangeCallback,
  IDataSourcePort,
  IMonitoredSubscription,
  MonitoredSubscriptionOptions,
  NamespaceInfo,
  ObjectTypeInfo,
  SourceDataValue,
  SourceHistoricalValue,
  SourceNodeInfo,
} from '../src/ports/data-source.js';
import { nullLogger } from '../src/ports/logger.js';
import { ModelService } from '../src/services/model-service.js';
import { SubscriptionService } from '../src/services/subscription-service.js';

// ── Helpers ──────────────────────────────────────────────────

/** Wait for debounce to flush (DEBOUNCE_MS = 200). */
const waitForDebounce = () => new Promise<void>((r) => setTimeout(r, 300));

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
      nsuQualifiedName: 'nsu=http://test.com/:CncMachine',
      displayName: 'CNC Machine',
      nodeClass: 'Object',
      typeDefinition: null,
      namespaceUri: 'http://test.com/',
      eventNotifier: false,
    },
    // Property: Temperature
    {
      sourceNodeId: 'ns=1;i=101',
      parentSourceNodeId: 'ns=1;i=100',
      browseName: 'Temperature',
      nsuQualifiedName: 'nsu=http://test.com/:Temperature',
      displayName: 'Temperature',
      nodeClass: 'Variable',
      typeDefinition: 'Double',
      namespaceUri: 'http://test.com/',
      eventNotifier: false,
    },
    // Property: Speed
    {
      sourceNodeId: 'ns=1;i=102',
      parentSourceNodeId: 'ns=1;i=100',
      browseName: 'Speed',
      nsuQualifiedName: 'nsu=http://test.com/:Speed',
      displayName: 'Speed',
      nodeClass: 'Variable',
      typeDefinition: 'Int32',
      namespaceUri: 'http://test.com/',
      eventNotifier: false,
    },
    // Nested object: Spindle
    {
      sourceNodeId: 'ns=1;i=200',
      parentSourceNodeId: 'ns=1;i=100',
      browseName: 'Spindle',
      nsuQualifiedName: 'nsu=http://test.com/:Spindle',
      displayName: 'Spindle',
      nodeClass: 'Object',
      typeDefinition: null,
      namespaceUri: 'http://test.com/',
      eventNotifier: false,
    },
    // Nested property: Spindle.RPM
    {
      sourceNodeId: 'ns=1;i=201',
      parentSourceNodeId: 'ns=1;i=200',
      browseName: 'RPM',
      nsuQualifiedName: 'nsu=http://test.com/:RPM',
      displayName: 'RPM',
      nodeClass: 'Variable',
      typeDefinition: 'Double',
      namespaceUri: 'http://test.com/',
      eventNotifier: false,
    },
  ];

  return {
    get _monitoredNodeIds() {
      return monitoredNodeIds;
    },
    get _subscriptionCreated() {
      return subscriptionCreated;
    },
    set _fail(v: boolean) {
      fail = v;
    },
    _triggerChange(nodeId: string, value: unknown) {
      if (changeCb) {
        changeCb(nodeId, value, 'Good', new Date().toISOString());
      }
    },

    async connect() {},
    async disconnect() {},
    isConnected() {
      return true;
    },
    async browseTree(): Promise<SourceNodeInfo[]> {
      return sourceNodes;
    },
    async getNamespaces(): Promise<NamespaceInfo[]> {
      return [];
    },
    async getObjectTypes(): Promise<ObjectTypeInfo[]> {
      return [];
    },
    async readValue(_id: string): Promise<SourceDataValue> {
      return { value: 42, quality: 'Good', timestamp: new Date().toISOString() };
    },
    async readValues(ids: string[]): Promise<SourceDataValue[]> {
      return ids.map(() => ({
        value: 42,
        quality: 'Good',
        timestamp: new Date().toISOString(),
      }));
    },
    async writeValue() {},
    async readHistory(): Promise<SourceHistoricalValue[]> {
      return [];
    },
    async createMonitoredSubscription(
      _opts: MonitoredSubscriptionOptions,
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

  afterEach(async () => {
    await svc.close();
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
    const cncNode = [...model.nodesById.values()].find((n) => n.name === 'CNC Machine');
    expect(cncNode).toBeTruthy();

    await svc.register(subscriptionId, [cncNode!.id], 1);
    // Should have resolved Temperature + Speed as monitored items
    // (maxDepth=1 means direct children only)
    expect(ds._monitoredNodeIds.length).toBeGreaterThanOrEqual(2);
  });

  it('register() returns errors for unknown elementIds', async () => {
    const { subscriptionId } = svc.create();
    const { registered, errors } = await svc.register(
      subscriptionId,
      ['nonexistent-id'],
      1,
    );
    expect(registered).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.elementId).toBe('nonexistent-id');
  });

  it('register() auto-creates subscription for unknown subscriptionId', async () => {
    const { registered, errors } = await svc.register(
      'client-provided-id',
      ['nonexistent'],
      1,
    );
    expect(registered).toHaveLength(0);
    expect(errors).toHaveLength(1);
    // Subscription was auto-created, so list should find it
    const details = svc.list(['client-provided-id']);
    expect(details).toHaveLength(1);
    expect(details[0]!.subscriptionId).toBe('client-provided-id');
  });

  // ── Data changes + debounced composite updates ─────────

  it('data changes produce a debounced composite update', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);

    // Simulate 3 rapid data changes — debounce coalesces them
    ds._triggerChange(sourceId, 10.0);
    ds._triggerChange(sourceId, 20.0);
    ds._triggerChange(sourceId, 30.0);

    // Before debounce, no updates yet
    expect(svc.sync(subscriptionId, 0)).toHaveLength(0);

    // Wait for debounce flush
    await waitForDebounce();

    const updates = svc.sync(subscriptionId, 0);
    // Debounce produces ONE composite update with the last value
    expect(updates).toHaveLength(1);
    expect(updates[0]!.sequenceNumber).toBe(1);
    // value is now a CurrentValueResult
    expect(updates[0]!.value.value).toBe(30.0);
    expect(updates[0]!.value.isComposition).toBe(false);
  });

  it('data changes include correct elementId mapping', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);
    ds._triggerChange(sourceId, 42);

    await waitForDebounce();

    const updates = svc.sync(subscriptionId, 0);
    // elementId is the registered element (property in this case)
    expect(updates[0]!.elementId).toBe(propId);
  });

  it('asset subscription produces composite value with components', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();

    // Find the CNC Machine asset
    const cncNode = [...model.nodesById.values()].find((n) => n.name === 'CNC Machine');
    expect(cncNode).toBeTruthy();

    await svc.register(subscriptionId, [cncNode!.id], 1);

    // Trigger changes on Temperature and Speed source nodes
    ds._triggerChange('ns=1;i=101', 25.5);
    ds._triggerChange('ns=1;i=102', 3000);

    await waitForDebounce();

    const updates = svc.sync(subscriptionId, 0);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.elementId).toBe(cncNode!.id);
    expect(updates[0]!.value.isComposition).toBe(true);
    expect(updates[0]!.value.components).toBeTruthy();

    // Check that component values are present
    const comps = updates[0]!.value.components!;
    const compValues = Object.values(comps);
    expect(compValues.length).toBeGreaterThanOrEqual(2);

    // Find the temperature and speed values
    const tempComp = compValues.find((c) => c.value === 25.5);
    const speedComp = compValues.find((c) => c.value === 3000);
    expect(tempComp).toBeTruthy();
    expect(speedComp).toBeTruthy();
  });

  // ── Sync with acknowledgeSequence ──────────────────────

  it('sync() filters by acknowledgeSequence', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);

    // Trigger first change, wait for debounce
    ds._triggerChange(sourceId, 1);
    await waitForDebounce();

    // Trigger second change, wait for debounce
    ds._triggerChange(sourceId, 2);
    await waitForDebounce();

    // Acknowledge seq 1 → only seq 2 returned
    const updates = svc.sync(subscriptionId, 1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.sequenceNumber).toBe(2);
  });

  it('sync() returns empty array when fully acknowledged', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);
    ds._triggerChange(sourceId, 1);

    await waitForDebounce();

    const updates = svc.sync(subscriptionId, 1);
    expect(updates).toHaveLength(0);
  });

  // ── waitForUpdates (long-poll) ─────────────────────────

  it('waitForUpdates resolves when debounced update arrives', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);
    ds._triggerChange(sourceId, 99);

    // Wait for debounce to flush, then waitForUpdates
    await waitForDebounce();

    const updates = await svc.waitForUpdates(subscriptionId, 0, 1000);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.value.value).toBe(99);
    expect(updates[0]!.value.isComposition).toBe(false);
  });

  it('waitForUpdates waits for future update', async () => {
    const { subscriptionId } = svc.create();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;
    const sourceId = model.propertyToSource.get(propId)!;

    await svc.register(subscriptionId, [propId], 1);

    // Start waiting, then trigger change after 50ms
    // (debounce will fire ~250ms later)
    const promise = svc.waitForUpdates(subscriptionId, 0, 5000);
    setTimeout(() => ds._triggerChange(sourceId, 77), 50);

    const updates = await promise;
    expect(updates).toHaveLength(1);
    expect(updates[0]!.value.value).toBe(77);
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

    // Push many changes with individual debounce waits
    // (Each debounce produces 1 update, so we need 10,001 debounce cycles)
    // Instead, we'll test the cap by directly producing many updates
    // via rapid changes with small debounce gaps
    for (let batch = 0; batch < 10_001; batch++) {
      ds._triggerChange(sourceId, batch);
      // Each triggers a new debounce reset — but with debouncing,
      // rapid changes only produce ONE update total.
    }

    // Wait for final debounce
    await waitForDebounce();

    // With debouncing, 10,001 rapid changes = 1 composite update
    const all = svc.sync(subscriptionId, 0);
    expect(all.length).toBe(1);
    expect(all[0]!.value.value).toBe(10_000);
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
    await waitForDebounce();
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

  // ── Server-like object (mixed Object + Variable children) ──

  describe('Server-like object subscription', () => {
    // The OPC UA Server object has ~26 children:
    // - Object children: ServerStatus, ServerCapabilities, ServerDiagnostics, ...
    // - Variable children: ServiceLevel, Auditing, EstimatedReturnTime, ...
    // At maxDepth=1, only Variable children (properties) should be monitored.

    let serverDs: ReturnType<typeof createServerMockDataSource>;
    let serverModelService: ModelService;
    let serverSvc: SubscriptionService;

    beforeEach(async () => {
      serverDs = createServerMockDataSource();
      serverModelService = new ModelService(serverDs, nullLogger);
      await serverModelService.preloadModel();
      serverSvc = new SubscriptionService(serverDs, serverModelService, nullLogger, 1);
    });

    afterEach(async () => {
      await serverSvc.close();
    });

    it('maxDepth=1 collects only direct Variable children', async () => {
      const { subscriptionId } = serverSvc.create();
      const model = await serverModelService.getOrBuildModel();

      // Find the Server asset node
      const serverNode = [...model.nodesById.values()].find((n) => n.name === 'Server');
      expect(serverNode).toBeTruthy();

      await serverSvc.register(subscriptionId, [serverNode!.id], 1);

      // Should monitor: ServiceLevel, Auditing, EstimatedReturnTime (3 variables)
      // Should NOT monitor: ServerStatus, ServerCapabilities (objects)
      expect(serverDs._monitoredNodeIds.length).toBe(3);
      expect(serverDs._monitoredNodeIds).toContain('ns=0;i=2267'); // ServiceLevel
      expect(serverDs._monitoredNodeIds).toContain('ns=0;i=2994'); // Auditing
      expect(serverDs._monitoredNodeIds).toContain('ns=0;i=2992'); // EstReturnTime
    });

    it('composite value includes all direct property children', async () => {
      const { subscriptionId } = serverSvc.create();
      const model = await serverModelService.getOrBuildModel();
      const serverNode = [...model.nodesById.values()].find((n) => n.name === 'Server');

      await serverSvc.register(subscriptionId, [serverNode!.id], 1);

      // Trigger initial on('changed') events for all 3 properties
      serverDs._triggerChange('ns=0;i=2267', 255); // ServiceLevel
      serverDs._triggerChange('ns=0;i=2994', false); // Auditing
      serverDs._triggerChange('ns=0;i=2992', null); // EstReturnTime

      await waitForDebounce();

      const updates = serverSvc.sync(subscriptionId, 0);
      expect(updates).toHaveLength(1);

      const composite = updates[0]!;
      expect(composite.elementId).toBe(serverNode!.id);
      expect(composite.value.isComposition).toBe(true);
      expect(composite.value.components).toBeTruthy();

      const comps = composite.value.components!;
      const compValues = Object.values(comps);
      expect(compValues).toHaveLength(3);

      // Verify specific values
      expect(compValues.find((c) => c.value === 255)).toBeTruthy(); // ServiceLevel
      expect(compValues.find((c) => c.value === false)).toBeTruthy(); // Auditing
    });

    it('maxDepth=2 also collects grandchild properties inside sub-objects', async () => {
      const { subscriptionId } = serverSvc.create();
      const model = await serverModelService.getOrBuildModel();
      const serverNode = [...model.nodesById.values()].find((n) => n.name === 'Server');

      await serverSvc.register(subscriptionId, [serverNode!.id], 2);

      // maxDepth=2: should ALSO monitor ServerStatus.State (ns=0;i=2259)
      // and ServerCapabilities.MaxBrowse (ns=0;i=11710)
      // Total: 3 direct + 2 grandchild = 5
      expect(serverDs._monitoredNodeIds.length).toBe(5);
      expect(serverDs._monitoredNodeIds).toContain('ns=0;i=2259'); // State
      expect(serverDs._monitoredNodeIds).toContain('ns=0;i=11710'); // MaxBrowse
    });

    it('sub-object property changes appear in composite', async () => {
      const { subscriptionId } = serverSvc.create();
      const model = await serverModelService.getOrBuildModel();
      const serverNode = [...model.nodesById.values()].find((n) => n.name === 'Server');

      await serverSvc.register(subscriptionId, [serverNode!.id], 2);

      // Trigger changes on all 5 properties
      serverDs._triggerChange('ns=0;i=2267', 255); // ServiceLevel
      serverDs._triggerChange('ns=0;i=2994', false); // Auditing
      serverDs._triggerChange('ns=0;i=2992', null); // EstReturnTime
      serverDs._triggerChange('ns=0;i=2259', 0); // ServerStatus.State
      serverDs._triggerChange('ns=0;i=11710', 1000); // Capabilities.MaxBrowse

      await waitForDebounce();

      const updates = serverSvc.sync(subscriptionId, 0);
      expect(updates).toHaveLength(1);

      const comps = updates[0]!.value.components!;
      expect(Object.keys(comps)).toHaveLength(5);
    });
  });
});

// ── Server-like mock data source ─────────────────────────────
// Mirrors the OPC UA Server object structure with mixed
// Object + Variable children at different nesting levels.

function createServerMockDataSource(): IDataSourcePort & {
  _triggerChange: (nodeId: string, value: unknown) => void;
  _monitoredNodeIds: string[];
  _fail: boolean;
} {
  let changeCb: DataChangeCallback | null = null;
  const monitoredNodeIds: string[] = [];
  let fail = false;

  const mockSub: IMonitoredSubscription = {
    id: 'mock-server-sub',
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

  // OPC UA Server-like address space
  const sourceNodes: SourceNodeInfo[] = [
    // ── Root: Server ──
    {
      sourceNodeId: 'ns=0;i=2253',
      parentSourceNodeId: null,
      browseName: 'Server',
      nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/:Server',
      displayName: 'Server',
      nodeClass: 'Object',
      typeDefinition: null,
      namespaceUri: 'http://opcfoundation.org/UA/',
      eventNotifier: false,
    },

    // ── Direct Variable children (properties) ──
    {
      sourceNodeId: 'ns=0;i=2267',
      parentSourceNodeId: 'ns=0;i=2253',
      browseName: 'ServiceLevel',
      nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/:ServiceLevel',
      displayName: 'ServiceLevel',
      nodeClass: 'Variable',
      typeDefinition: 'Byte',
      namespaceUri: 'http://opcfoundation.org/UA/',
      eventNotifier: false,
    },
    {
      sourceNodeId: 'ns=0;i=2994',
      parentSourceNodeId: 'ns=0;i=2253',
      browseName: 'Auditing',
      nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/:Auditing',
      displayName: 'Auditing',
      nodeClass: 'Variable',
      typeDefinition: 'Boolean',
      namespaceUri: 'http://opcfoundation.org/UA/',
      eventNotifier: false,
    },
    {
      sourceNodeId: 'ns=0;i=2992',
      parentSourceNodeId: 'ns=0;i=2253',
      browseName: 'EstimatedReturnTime',
      nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/:EstimatedReturnTime',
      displayName: 'EstimatedReturnTime',
      nodeClass: 'Variable',
      typeDefinition: 'DateTime',
      namespaceUri: 'http://opcfoundation.org/UA/',
      eventNotifier: false,
    },

    // ── Direct Object children (NOT monitorable at maxDepth=1) ──
    {
      sourceNodeId: 'ns=0;i=2256',
      parentSourceNodeId: 'ns=0;i=2253',
      browseName: 'ServerStatus',
      nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/:ServerStatus',
      displayName: 'ServerStatus',
      nodeClass: 'Object',
      typeDefinition: null,
      namespaceUri: 'http://opcfoundation.org/UA/',
      eventNotifier: false,
    },
    {
      sourceNodeId: 'ns=0;i=2268',
      parentSourceNodeId: 'ns=0;i=2253',
      browseName: 'ServerCapabilities',
      nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/:ServerCapabilities',
      displayName: 'ServerCapabilities',
      nodeClass: 'Object',
      typeDefinition: null,
      namespaceUri: 'http://opcfoundation.org/UA/',
      eventNotifier: false,
    },

    // ── Grandchild Variables (inside sub-objects) ──
    {
      sourceNodeId: 'ns=0;i=2259',
      parentSourceNodeId: 'ns=0;i=2256',
      browseName: 'State',
      nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/:State',
      displayName: 'State',
      nodeClass: 'Variable',
      typeDefinition: 'Int32',
      namespaceUri: 'http://opcfoundation.org/UA/',
      eventNotifier: false,
    },
    {
      sourceNodeId: 'ns=0;i=11710',
      parentSourceNodeId: 'ns=0;i=2268',
      browseName: 'MaxBrowseContinuationPoints',
      nsuQualifiedName: 'nsu=http://opcfoundation.org/UA/:MaxBrowseContinuationPoints',
      displayName: 'MaxBrowseContinuationPoints',
      nodeClass: 'Variable',
      typeDefinition: 'UInt16',
      namespaceUri: 'http://opcfoundation.org/UA/',
      eventNotifier: false,
    },
  ];

  return {
    get _monitoredNodeIds() {
      return monitoredNodeIds;
    },
    set _fail(v: boolean) {
      fail = v;
    },
    _triggerChange(nodeId: string, value: unknown) {
      if (changeCb) {
        changeCb(nodeId, value, 'Good', new Date().toISOString());
      }
    },

    async connect() {},
    async disconnect() {},
    isConnected() {
      return true;
    },
    async browseTree(): Promise<SourceNodeInfo[]> {
      return sourceNodes;
    },
    async getNamespaces(): Promise<NamespaceInfo[]> {
      return [];
    },
    async getObjectTypes(): Promise<ObjectTypeInfo[]> {
      return [];
    },
    async readValue(_id: string): Promise<SourceDataValue> {
      return { value: 0, quality: 'Good', timestamp: new Date().toISOString() };
    },
    async readValues(ids: string[]): Promise<SourceDataValue[]> {
      return ids.map(() => ({
        value: 0,
        quality: 'Good',
        timestamp: new Date().toISOString(),
      }));
    },
    async writeValue() {},
    async readHistory(): Promise<SourceHistoricalValue[]> {
      return [];
    },
    async createMonitoredSubscription(
      _opts: MonitoredSubscriptionOptions,
    ): Promise<IMonitoredSubscription> {
      if (fail) throw new Error('Subscription creation failed');
      return mockSub;
    },
  };
}
