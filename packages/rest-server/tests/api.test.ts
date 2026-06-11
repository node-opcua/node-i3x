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
  stableI3xId,
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
        members: [
          {
            browseName: 'Temperature',
            displayName: 'Temperature',
            nodeClass: 'Variable',
            dataType: 'Double',
            modellingRule: 'Mandatory',
          },
        ],
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
    expect(body.result.specVersion).toBe('1.0');
    expect(body.result.capabilities.subscribe.stream).toBe(true);
  });

  it('responds with gzip when Accept-Encoding: gzip is sent', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/namespaces',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('GET /v1/namespaces returns namespace list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/namespaces' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result).toHaveLength(2);
  });

  it('GET /v1/objecttypes returns object types with JSON schemas', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/objecttypes' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.length).toBeGreaterThanOrEqual(1);

    // Find the MachineType (not UnknownType)
    const machineType = body.result.find(
      (t: Record<string, unknown>) => t.displayName === 'Machine Type',
    );
    expect(machineType).toBeDefined();
    expect(machineType.schema.$schema).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
    expect(machineType.schema.type).toBe('object');
    expect(machineType.schema.properties.Temperature).toEqual({
      type: 'number',
    });
    expect(machineType.schema.required).toContain('Temperature');
  });

  it('GET /v1/objects returns assets and properties', async () => {
    await modelService.preloadModel();
    const res = await app.inject({ method: 'GET', url: '/v1/objects' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.length).toBeGreaterThanOrEqual(1);
    // Should contain at least one asset
    expect(body.result.some((r: any) => r.elementId.startsWith('asset-'))).toBe(true);
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
      payload: {
        subscriptionId: subId,
        elementIds: [propId],
        maxDepth: 1,
        clientId: 'test',
      },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.json().success).toBe(true);
    expect(regRes.json().results[0].success).toBe(true);
    expect(regRes.json().results[0].elementId).toBe(propId);

    // List — now returns BulkResponse with result wrapper
    const listRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/list',
      payload: { subscriptionIds: [subId], clientId: 'test' },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().results[0].success).toBe(true);
    expect(listRes.json().results[0].subscriptionId).toBe(subId);
    expect(listRes.json().results[0].result.subscriptionId).toBe(subId);

    // Delete
    const delRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/delete',
      payload: { subscriptionIds: [subId], clientId: 'test' },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().results[0].success).toBe(true);
  });

  it('POST /v1/subscriptions/stream returns 404 for missing subscription', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/stream',
      payload: { subscriptionId: 'missing', clientId: 'test' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.responseDetail).toEqual({
      title: 'Not Found',
      status: 404,
      detail: expect.any(String),
    });
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
    expect(body1.results[0].result.value).toBeNull();
    expect(body1.results[0].result.quality).toBe('GoodNoData');
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

    // 3. maxDepth = 0 (infinite) => components are returned
    const resDepth0 = await app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [rootId], maxDepth: 0 },
    });
    expect(resDepth0.statusCode).toBe(200);
    const body0 = resDepth0.json();
    expect(body0.results[0].result.isComposition).toBe(true);
    expect(body0.results[0].result.components).not.toBeNull();
    const tempKey0 = Object.keys(body0.results[0].result.components)[0]!;
    expect(body0.results[0].result.components[tempKey0].value).toBe(42.5);

    // 4. Null value quality mapping
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

  it('bulk responses set top-level success: false on failure and include responseDetail', async () => {
    await modelService.preloadModel();
    const model = await modelService.getOrBuildModel();
    const rootId = model.rootIds[0]!;

    // 1. POST /v1/objects/list with a missing element returns top-level success: false
    const res = await app.inject({
      method: 'POST',
      url: '/v1/objects/list',
      payload: { elementIds: [rootId, 'missing-element-id'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false); // Top level success must be false
    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(false);
    expect(body.results[1].responseDetail).toEqual({
      title: 'Error',
      status: 404,
      detail: 'Not found',
    });

    // 2. POST /v1/subscriptions/unregister returns correct bulk response format
    // Create subscription first
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'test-unregister', displayName: 'Unreg Sub' },
    });
    const subId = createRes.json().result.subscriptionId;

    // Register a property
    const propId = [...model.propertyToSource.keys()][0]!;
    await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: {
        subscriptionId: subId,
        elementIds: [propId],
        maxDepth: 1,
        clientId: 'test-unregister',
      },
    });

    // Unregister
    const unregRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/unregister',
      payload: {
        subscriptionId: subId,
        elementIds: [propId],
        clientId: 'test-unregister',
      },
    });
    expect(unregRes.statusCode).toBe(200);
    const unregBody = unregRes.json();
    expect(unregBody.success).toBe(true);
    expect(unregBody.results).toHaveLength(1);
    expect(unregBody.results[0].success).toBe(true);
    expect(unregBody.results[0].elementId).toBe(propId);
  });

  it('POST /v1/subscriptions/unregister reports failure for unknown elementId', async () => {
    await modelService.preloadModel();

    // Create subscription
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'test-unreg-unknown', displayName: 'Unreg Unknown' },
    });
    const subId = createRes.json().result.subscriptionId;

    // Unregister an elementId that was never registered
    const res = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/unregister',
      payload: {
        subscriptionId: subId,
        elementIds: ['never-registered-element'],
        clientId: 'test-unreg-unknown',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].elementId).toBe('never-registered-element');
    expect(body.results[0].responseDetail).toEqual({
      title: 'Not Found',
      status: 404,
      detail: 'Element not monitored',
    });
  });

  it('POST /v1/objecttypes/query returns bulk object types details', async () => {
    // MachineType elementId — browse path uses browseName (not displayName)
    // Mock has parentSourceNodeId=null, so path = just the root segment
    const machineTypeId = stableI3xId('nsu=http://example.com/:MachineType', 'type');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/objecttypes/query',
      payload: { elementIds: [machineTypeId, 'UnknownType', 'missing-type-id'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false); // Top level false due to missing-type-id
    expect(body.results).toHaveLength(3);

    expect(body.results[0].success).toBe(true);
    expect(body.results[0].elementId).toBe(machineTypeId);
    expect(body.results[0].result.displayName).toBe('Machine Type');

    expect(body.results[1].success).toBe(true);
    expect(body.results[1].elementId).toBe('UnknownType');
    expect(body.results[1].result.displayName).toBe('UnknownType');

    expect(body.results[2].success).toBe(false);
    expect(body.results[2].elementId).toBe('missing-type-id');
    expect(body.results[2].error.code).toBe(404);
  });

  it('GET /v1/relationshiptypes returns static relationship types list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/relationshiptypes' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result).toHaveLength(2);
    expect(body.result[0].elementId).toBe('HasComponent');
    expect(body.result[1].elementId).toBe('IsComponentOf');
  });

  it('POST /v1/relationshiptypes/query returns bulk relationship types details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/relationshiptypes/query',
      payload: { elementIds: ['HasComponent', 'missing-rel-id'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false); // Top level false due to missing-rel-id
    expect(body.results).toHaveLength(2);
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].elementId).toBe('HasComponent');
    expect(body.results[1].success).toBe(false);
    expect(body.results[1].elementId).toBe('missing-rel-id');
    expect(body.results[1].error.code).toBe(404);
  });

  it('PUT /v1/objects/value handles bulk updates in array and object formats', async () => {
    await modelService.preloadModel();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;

    // 1. Array format update
    const resArray = await app.inject({
      method: 'PUT',
      url: '/v1/objects/value',
      payload: [{ elementId: propId, value: 50.0 }],
    });
    expect(resArray.statusCode).toBe(200);
    const bodyArray = resArray.json();
    expect(bodyArray.success).toBe(true);
    expect(bodyArray.results[0].success).toBe(true);
    expect(bodyArray.results[0].elementId).toBe(propId);

    // Verify change
    const valRes1 = await app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [propId] },
    });
    expect(valRes1.json().results[0].result.value).toBe(50.0);

    // 2. Object format update
    const resObj = await app.inject({
      method: 'PUT',
      url: '/v1/objects/value',
      payload: { [propId]: 60.0, 'missing-prop': 10 },
    });
    expect(resObj.statusCode).toBe(200);
    const bodyObj = resObj.json();
    expect(bodyObj.success).toBe(false); // Top level success false due to missing-prop
    expect(bodyObj.results).toHaveLength(2);
    expect(bodyObj.results.find((r: any) => r.elementId === propId).success).toBe(true);
    expect(bodyObj.results.find((r: any) => r.elementId === 'missing-prop').success).toBe(
      false,
    );

    // Verify change
    const valRes2 = await app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [propId] },
    });
    expect(valRes2.json().results[0].result.value).toBe(60.0);

    // 3. PUT /v1/objects/history returns 501
    const resHist = await app.inject({
      method: 'PUT',
      url: '/v1/objects/history',
    });
    expect(resHist.statusCode).toBe(501);
  });

  it('enforces clientId checks and returns 400/404 appropriately', async () => {
    // 1. Create subscription with missing clientId -> 400 Bad Request
    const resCreateMissing = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { displayName: 'No Client ID' },
    });
    expect(resCreateMissing.statusCode).toBe(400);

    // 2. Create subscription with correct clientId
    const resCreate = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'client-a', displayName: 'Client A Sub' },
    });
    expect(resCreate.statusCode).toBe(200);
    const subId = resCreate.json().result.subscriptionId;

    // 3. Register with missing clientId -> 400 Bad Request
    const resRegMissing = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: { subscriptionId: subId, elementIds: [] },
    });
    expect(resRegMissing.statusCode).toBe(400);

    // 4. Register with incorrect clientId -> 404 Not Found
    const resRegWrong = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: { subscriptionId: subId, elementIds: [], clientId: 'client-b' },
    });
    expect(resRegWrong.statusCode).toBe(404);

    // 5. Register with correct clientId -> 200 OK
    const resRegOk = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: { subscriptionId: subId, elementIds: [], clientId: 'client-a' },
    });
    expect(resRegOk.statusCode).toBe(200);

    // 6. Delete with wrong client -> 404 Not Found
    const resDelWrong = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/delete',
      payload: { subscriptionIds: [subId], clientId: 'client-b' },
    });
    expect(resDelWrong.statusCode).toBe(404);
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
  it('POST /v1/objects/value failed items include responseDetail', async () => {
    await modelService.preloadModel();
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [propId, 'no-such-element'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(false);
    expect(body.results[1].responseDetail).toEqual({
      title: 'Not Found',
      status: 404,
      detail: 'Object value not found',
    });
  });

  it('POST /v1/objects/history failed items include responseDetail', async () => {
    await modelService.preloadModel();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/objects/history',
      payload: { elementIds: ['no-such-element'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].responseDetail).toEqual({
      title: 'Not Found',
      status: 404,
      detail: 'Element not found',
    });
  });
});
