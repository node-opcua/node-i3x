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
} from '@node-i3x/core';
import {
  HistoryService,
  ModelService,
  nullLogger,
  SubscriptionService,
  ValueService,
} from '@node-i3x/core';
import { createApp } from '@node-i3x/rest-server';
import { beforeAll, describe, expect, it } from 'vitest';

// ── Mock data source ─────────────────────────────────────────

class MockDataSource implements IDataSourcePort {
  values: Record<string, unknown> = { 'ns=2;s=Temperature': 42.5 };
  connected = true;

  async connect() {
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }

  async browseTree(): Promise<SourceNodeInfo[]> {
    return [
      {
        sourceNodeId: 'ns=2;s=Machine',
        parentSourceNodeId: null,
        browseName: 'Machine',
        nsuQualifiedName: 'nsu=http://example.com/:Machine',
        displayName: 'Machine',
        nodeClass: 'Object',
        typeDefinition: null,
        namespaceUri: 'http://example.com/',
        eventNotifier: false,
      },
      {
        sourceNodeId: 'ns=2;s=Temperature',
        parentSourceNodeId: 'ns=2;s=Machine',
        browseName: 'Temperature',
        nsuQualifiedName: 'nsu=http://example.com/:Temperature',
        displayName: 'Temperature',
        nodeClass: 'Variable',
        typeDefinition: 'Double',
        namespaceUri: 'http://example.com/',
        eventNotifier: false,
      },
      {
        sourceNodeId: 'ns=2;s=Reset',
        parentSourceNodeId: 'ns=2;s=Machine',
        browseName: 'Reset',
        nsuQualifiedName: 'nsu=http://example.com/:Reset',
        displayName: 'Reset',
        nodeClass: 'Method',
        typeDefinition: null,
        namespaceUri: 'http://example.com/',
        eventNotifier: false,
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
      {
        sourceNodeId: 'ns=1;i=1001',
        parentSourceNodeId: null,
        browseName: 'MachineType',
        displayName: 'Machine Type',
        namespaceUri: 'http://example.com/',
      },
    ];
  }

  async readValue(nodeId: string): Promise<SourceDataValue> {
    return {
      value: this.values[nodeId] ?? null,
      quality: 'Good',
      timestamp: new Date().toISOString(),
    };
  }

  async readValues(nodeIds: string[]): Promise<SourceDataValue[]> {
    return nodeIds.map((id) => ({
      value: this.values[id] ?? null,
      quality: 'Good',
      timestamp: new Date().toISOString(),
    }));
  }

  async writeValue(nodeId: string, value: unknown) {
    this.values[nodeId] = value;
  }

  async readHistory(): Promise<SourceHistoricalValue[]> {
    return [{ value: 42, quality: 'Good', timestamp: new Date().toISOString() }];
  }

  async createMonitoredSubscription(
    _opts: MonitoredSubscriptionOptions,
  ): Promise<IMonitoredSubscription> {
    let _cb: DataChangeCallback | null = null;
    return {
      id: 'mock-sub',
      async addItems() {},
      async removeItems() {},
      onDataChange(c) {
        _cb = c;
      },
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
      dataSource: ds,
      modelService,
      valueService,
      historyService,
      subscriptionService,
      logger,
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

  it('GET /v1/objects only returns assets (no properties or actions)', async () => {
    await modelService.preloadModel();
    const res = await app.inject({ method: 'GET', url: '/v1/objects' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result).toHaveLength(1);
    expect(body.result[0].elementId).toContain('asset-');
  });

  it('POST /v1/objects/list resolves elements', async () => {
    // Preload model first
    await modelService.preloadModel();
    const model = await modelService.getOrBuildModel();
    const rootId = model.rootIds[0]!;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/objects/list',
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
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'test', displayName: 'Test Sub' },
    });
    expect(createRes.statusCode).toBe(200);
    const subId = createRes.json().result.subscriptionId;

    // Register — now returns BulkResponse
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: { subscriptionId: subId, elementIds: [propId], maxDepth: 1 },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.json().success).toBe(true);
    expect(regRes.json().results[0].success).toBe(true);
    expect(regRes.json().results[0].elementId).toBe(propId);

    // List — now returns BulkResponse with result wrapper
    const listRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/list',
      payload: { subscriptionIds: [subId] },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().results[0].success).toBe(true);
    expect(listRes.json().results[0].subscriptionId).toBe(subId);
    expect(listRes.json().results[0].result.subscriptionId).toBe(subId);

    // Delete
    const delRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/delete',
      payload: { subscriptionIds: [subId] },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().results[0].success).toBe(true);
  });

  it('POST /v1/subscriptions/stream returns 404 for missing subscription', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/stream',
      payload: { subscriptionId: 'missing' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /v1/objects/value obeys maxDepth semantics and maps null quality', async () => {
    await modelService.preloadModel();
    const model = await modelService.getOrBuildModel();
    const rootId = model.rootIds[0]!; // Machine asset

    // 1. maxDepth = 1 => components is null
    const resDepth1 = await app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [rootId], maxDepth: 1 },
    });
    expect(resDepth1.statusCode).toBe(200);
    const body1 = resDepth1.json();
    expect(body1.success).toBe(true);
    expect(body1.results[0].result.isComposition).toBe(true);
    expect(body1.results[0].result.components).toBeNull();

    // 2. maxDepth = 2 => components contains Temperature property
    const resDepth2 = await app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [rootId], maxDepth: 2 },
    });
    expect(resDepth2.statusCode).toBe(200);
    const body2 = resDepth2.json();
    expect(body2.success).toBe(true);
    expect(body2.results[0].result.isComposition).toBe(true);
    expect(body2.results[0].result.components).not.toBeNull();
    const tempKey = Object.keys(body2.results[0].result.components)[0]!;
    expect(body2.results[0].result.components[tempKey].value).toBe(42.5);
    expect(body2.results[0].result.components[tempKey].quality).toBe('Good');

    // 3. Null value quality mapping
    // Set Temperature to null
    const ds = (modelService as any).dataSource as MockDataSource;
    ds.values['ns=2;s=Temperature'] = null;

    const resNullVal = await app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [rootId], maxDepth: 2 },
    });
    const bodyNullVal = resNullVal.json();
    expect(bodyNullVal.results[0].result.components[tempKey].value).toBeNull();
    expect(bodyNullVal.results[0].result.components[tempKey].quality).toBe('GoodNoData');

    // Restore temperature value
    ds.values['ns=2;s=Temperature'] = 42.5;
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
});
