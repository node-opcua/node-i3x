import { describe, it, expect, beforeAll } from 'vitest';
import type {
  IDataSourcePort, SourceNodeInfo, SourceDataValue,
  SourceHistoricalValue, NamespaceInfo, ObjectTypeInfo,
  IMonitoredSubscription, MonitoredSubscriptionOptions,
  DataChangeCallback, ILogger,
} from '@i3x/core';
import {
  ModelService, ValueService, HistoryService,
  SubscriptionService, nullLogger, emptyBuildResult,
} from '@i3x/core';
import { createApp } from '@i3x/rest-server';

// ── Mock data source ─────────────────────────────────────────

class MockDataSource implements IDataSourcePort {
  values: Record<string, unknown> = { 'ns=2;s=Temperature': 42.5 };
  connected = true;

  async connect() { this.connected = true; }
  async disconnect() { this.connected = false; }
  isConnected() { return this.connected; }

  async browseTree(): Promise<SourceNodeInfo[]> {
    return [
      {
        sourceNodeId: 'ns=2;s=Machine', parentSourceNodeId: null,
        browseName: 'Machine', displayName: 'Machine',
        nodeClass: 'Object', dataType: null, eventNotifier: false,
      },
      {
        sourceNodeId: 'ns=2;s=Temperature', parentSourceNodeId: 'ns=2;s=Machine',
        browseName: 'Temperature', displayName: 'Temperature',
        nodeClass: 'Variable', dataType: 'Double', eventNotifier: false,
      },
      {
        sourceNodeId: 'ns=2;s=Reset', parentSourceNodeId: 'ns=2;s=Machine',
        browseName: 'Reset', displayName: 'Reset',
        nodeClass: 'Method', dataType: null, eventNotifier: false,
      },
    ];
  }

  async getNamespaces(): Promise<NamespaceInfo[]> {
    return [
      { uri: 'http://example.com/i3x', displayName: 'I3X' },
      { uri: 'http://example.com/custom', displayName: 'Custom' },
    ];
  }

  async getObjectTypes(): Promise<ObjectTypeInfo[]> {
    return [
      { sourceNodeId: 'ns=1;i=1001', parentSourceNodeId: null, browseName: 'MachineType', displayName: 'Machine Type' },
    ];
  }

  async readValue(nodeId: string): Promise<SourceDataValue> {
    return { value: this.values[nodeId] ?? null, quality: 'Good', timestamp: new Date().toISOString() };
  }

  async readValues(nodeIds: string[]): Promise<SourceDataValue[]> {
    return nodeIds.map((id) => ({
      value: this.values[id] ?? null, quality: 'Good', timestamp: new Date().toISOString(),
    }));
  }

  async writeValue(nodeId: string, value: unknown) {
    this.values[nodeId] = value;
  }

  async readHistory(): Promise<SourceHistoricalValue[]> {
    return [{ value: 42, quality: 'Good', timestamp: new Date().toISOString() }];
  }

  async createMonitoredSubscription(opts: MonitoredSubscriptionOptions): Promise<IMonitoredSubscription> {
    let cb: DataChangeCallback | null = null;
    return {
      id: 'mock-sub',
      async addItems() {},
      async removeItems() {},
      onDataChange(c) { cb = c; },
      async close() {},
    };
  }
}

// ── Tests ────────────────────────────────────────────────────

describe('REST API', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let modelService: ModelService;
  let subscriptionService: SubscriptionService;

  beforeAll(async () => {
    const ds = new MockDataSource();
    const logger = nullLogger;
    modelService = new ModelService(ds, logger);
    const valueService = new ValueService(ds, modelService, logger);
    const historyService = new HistoryService(ds, modelService, logger);
    subscriptionService = new SubscriptionService(ds, modelService, logger, 1);

    app = await createApp({
      dataSource: ds, modelService, valueService,
      historyService, subscriptionService, logger,
    });
  });

  it('GET /v1/info returns server capabilities', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/info' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.specVersion).toBe('beta');
    expect(body.result.capabilities.subscribe.stream).toBe(true);
  });

  it('GET /v1/namespaces returns namespace list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/namespaces' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result).toHaveLength(2);
  });

  it('GET /v1/objecttypes returns object types', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/objecttypes' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /v1/objects/list resolves elements', async () => {
    // Preload model first
    await modelService.preloadModel();
    const model = await modelService.getOrBuildModel();
    const rootId = model.rootIds[0]!;

    const res = await app.inject({
      method: 'POST', url: '/v1/objects/list',
      payload: { elementIds: [rootId, 'missing'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(false);
  });

  it('subscription lifecycle: create → register → sync → delete', async () => {
    await modelService.preloadModel();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;

    // Create
    const createRes = await app.inject({
      method: 'POST', url: '/v1/subscriptions',
      payload: { clientId: 'test', displayName: 'Test Sub' },
    });
    expect(createRes.statusCode).toBe(200);
    const subId = createRes.json().result.subscriptionId;

    // Register
    const regRes = await app.inject({
      method: 'POST', url: '/v1/subscriptions/register',
      payload: { subscriptionId: subId, elementIds: [propId], maxDepth: 1 },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.json().success).toBe(true);

    // List
    const listRes = await app.inject({
      method: 'POST', url: '/v1/subscriptions/list',
      payload: { subscriptionIds: [subId] },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().results[0].subscriptionId).toBe(subId);

    // Delete
    const delRes = await app.inject({
      method: 'POST', url: '/v1/subscriptions/delete',
      payload: { subscriptionIds: [subId] },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().results[0].success).toBe(true);
  });

  it('POST /v1/subscriptions/stream returns 404 for missing subscription', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/subscriptions/stream',
      payload: { subscriptionId: 'missing' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
});
