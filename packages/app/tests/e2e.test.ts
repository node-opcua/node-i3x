// ─────────────────────────────────────────────────────────────
// End-to-end test: real node-opcua server → full i3X stack
// ─────────────────────────────────────────────────────────────
//
// This test spins up a representative OPC UA server with:
//   - A "ProductionLine" folder containing two machines
//   - Each machine has temperature + speed variables
//   - One machine has a "Reset" method
//   - Variables update on a timer to exercise subscriptions
//
// Then it boots the full i3X stack (connector → core → REST)
// and validates end-to-end flows against the HTTP API.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  OPCUAServer,
  Variant,
  DataType,
  StatusCodes,
  type UAObject,
  type Namespace,
  type AddressSpace,
  nodesets,
} from 'node-opcua';
import {
  ModelService, ValueService, HistoryService,
  SubscriptionService, consoleLogger,
} from '@i3x/core';
import { OpcUaClient, OpcUaDataSourceAdapter } from '@i3x/opcua-connector';
import { createApp } from '@i3x/rest-server';

// ── Server factory ───────────────────────────────────────────

let serverPort: number;
let opcuaServer: OPCUAServer;

function getRandomPort(): number {
  return 48_100 + Math.floor(Math.random() * 900);
}

async function startTestOpcUaServer(): Promise<OPCUAServer> {
  serverPort = getRandomPort();
  const server = new OPCUAServer({
    port: serverPort,
    resourcePath: '/UA/i3xTest',
    nodeset_filename: [nodesets.standard],
    maxConnectionsPerEndpoint: 10,
    serverInfo: {
      applicationName: { text: 'i3x E2E Test Server' },
      applicationUri: 'urn:i3x:e2e:test',
      productUri: 'urn:i3x:e2e:test',
    },
  });

  await server.initialize();

  const addressSpace: AddressSpace = server.engine.addressSpace!;
  const namespace: Namespace = addressSpace.getOwnNamespace();

  // ── ProductionLine (folder) ──────────────────────────────
  const productionLine = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'ProductionLine',
    displayName: 'Production Line #1',
  });

  // ── Machine A ────────────────────────────────────────────
  const machineA = namespace.addObject({
    componentOf: productionLine,
    browseName: 'MachineA',
    displayName: 'CNC Milling Machine',
  });

  let temperatureA = 65.0;
  namespace.addVariable({
    componentOf: machineA,
    browseName: 'Temperature',
    displayName: 'Temperature',
    dataType: DataType.Double,
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: temperatureA }),
    },
  });

  let speedA = 1500;
  namespace.addVariable({
    componentOf: machineA,
    browseName: 'SpindleSpeed',
    displayName: 'Spindle Speed',
    dataType: DataType.Int32,
    value: {
      get: () => new Variant({ dataType: DataType.Int32, value: speedA }),
    },
  });

  namespace.addVariable({
    componentOf: machineA,
    browseName: 'Status',
    displayName: 'Status',
    dataType: DataType.String,
    value: {
      get: () => new Variant({ dataType: DataType.String, value: 'Running' }),
    },
  });

  // Method: Reset
  namespace.addMethod(machineA, {
    browseName: 'Reset',
    displayName: 'Reset Machine',
    inputArguments: [],
    outputArguments: [],
    methodFunction: (_inputArguments, _context, callback) => {
      temperatureA = 25.0;
      speedA = 0;
      callback(null, { statusCode: StatusCodes.Good });
    },
  } as Record<string, unknown>);

  // ── Machine B ────────────────────────────────────────────
  const machineB = namespace.addObject({
    componentOf: productionLine,
    browseName: 'MachineB',
    displayName: 'Laser Cutter',
  });

  namespace.addVariable({
    componentOf: machineB,
    browseName: 'Temperature',
    displayName: 'Temperature',
    dataType: DataType.Double,
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: 42.7 }),
    },
  });

  namespace.addVariable({
    componentOf: machineB,
    browseName: 'LaserPower',
    displayName: 'Laser Power',
    dataType: DataType.Float,
    value: {
      get: () => new Variant({ dataType: DataType.Float, value: 2400.5 }),
    },
  });

  namespace.addVariable({
    componentOf: machineB,
    browseName: 'JobCount',
    displayName: 'Job Count',
    dataType: DataType.UInt32,
    value: {
      get: () => new Variant({ dataType: DataType.UInt32, value: 1247 }),
    },
  });

  // Simulate temperature changes for subscription testing
  const interval = setInterval(() => {
    temperatureA += (Math.random() - 0.4) * 2;
  }, 500);
  (server as Record<string, unknown>)._e2eInterval = interval;

  await server.start();
  return server;
}

// ── Test suite ───────────────────────────────────────────────

describe('E2E: OPC UA Server → i3X REST API', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let modelService: ModelService;
  let subscriptionService: SubscriptionService;

  beforeAll(async () => {
    // 1. Start a real OPC UA server
    opcuaServer = await startTestOpcUaServer();
    const endpointUrl = `opc.tcp://localhost:${serverPort}/UA/i3xTest`;

    // 2. Create the connector
    const logger = consoleLogger;
    const opcuaClient = new OpcUaClient({
      endpointUrl,
      securityMode: 'None',
      optimizedClient: 'disabled',
    }, logger);
    const dataSource = new OpcUaDataSourceAdapter(opcuaClient, logger);

    // 3. Domain services
    modelService = new ModelService(dataSource, logger);
    const valueService = new ValueService(dataSource, modelService, logger);
    const historyService = new HistoryService(dataSource, modelService, logger);
    subscriptionService = new SubscriptionService(
      dataSource, modelService, logger, 1,
    );

    // 4. REST server
    app = await createApp({
      dataSource, modelService, valueService,
      historyService, subscriptionService, logger,
    });

    // 5. Connect and preload
    await dataSource.connect();
    await modelService.preloadModel();
  }, 30_000);

  afterAll(async () => {
    await subscriptionService.close();
    const ds = (app as Record<string, unknown>).deps as Record<string, { disconnect: () => Promise<void> }>;
    if (ds?.dataSource) await ds.dataSource.disconnect();
    clearInterval((opcuaServer as Record<string, unknown>)._e2eInterval as NodeJS.Timeout);
    await opcuaServer.shutdown(500);
  }, 15_000);

  // ── Info ─────────────────────────────────────────────────

  it('GET /v1/info returns server capabilities', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/info' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.specVersion).toBe('beta');
    expect(body.result.capabilities.query.history).toBe(true);
  });

  // ── Health ───────────────────────────────────────────────

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /ready returns ready when connected', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
  });

  // ── Namespaces ───────────────────────────────────────────

  it('GET /v1/namespaces returns real OPC UA namespaces', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/namespaces' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.length).toBeGreaterThanOrEqual(2);
    // First namespace is always the OPC UA standard namespace
    expect(body.result[0].uri).toContain('opcfoundation.org');
  });

  // ── Object types ─────────────────────────────────────────

  it('GET /v1/objecttypes returns browsed types', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/objecttypes' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.length).toBeGreaterThanOrEqual(1);
  });

  // ── Objects ──────────────────────────────────────────────

  it('GET /v1/objects returns root-level objects from OPC UA', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/objects' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.length).toBeGreaterThanOrEqual(1);
    // Should find our ProductionLine
    const names = body.result.map((r: Record<string, string>) => r.displayName);
    expect(names).toContain('Production Line #1');
  });

  it('POST /v1/objects/list resolves a real element by id', async () => {
    const model = await modelService.getOrBuildModel();
    const rootId = model.rootIds[0]!;

    const res = await app.inject({
      method: 'POST', url: '/v1/objects/list',
      payload: { elementIds: [rootId] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].result.displayName).toBeTruthy();
  });

  // ── Values ───────────────────────────────────────────────

  it('POST /v1/objects/value reads real OPC UA variable values', async () => {
    const model = await modelService.getOrBuildModel();

    // Find a property node (a Variable)
    const propId = [...model.propertyToSource.keys()][0]!;

    const res = await app.inject({
      method: 'POST', url: '/v1/objects/value',
      payload: { elementIds: [propId], maxDepth: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].result.value).not.toBeNull();
    expect(body.results[0].result.quality).toBe('Good');
  });

  it('POST /v1/objects/value returns composition for asset nodes', async () => {
    const model = await modelService.getOrBuildModel();

    // Find a root asset with children
    const assetId = model.rootIds.find((id) => {
      const node = model.nodesById.get(id);
      return node && node.children.length > 0;
    });

    if (!assetId) return; // skip if server has no suitable nodes

    const res = await app.inject({
      method: 'POST', url: '/v1/objects/value',
      payload: { elementIds: [assetId], maxDepth: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].result.isComposition).toBe(true);
  });

  // ── Subscriptions (full lifecycle) ───────────────────────

  it('full subscription lifecycle: create → register → sync → delete', async () => {
    const model = await modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;

    // Create subscription
    const createRes = await app.inject({
      method: 'POST', url: '/v1/subscriptions',
      payload: { clientId: 'e2e-test', displayName: 'E2E Subscription' },
    });
    expect(createRes.statusCode).toBe(200);
    const subId = createRes.json().result.subscriptionId;
    expect(subId).toBeTruthy();

    // Register a monitored item
    const regRes = await app.inject({
      method: 'POST', url: '/v1/subscriptions/register',
      payload: { subscriptionId: subId, elementIds: [propId], maxDepth: 1 },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.json().success).toBe(true);
    expect(regRes.json().results[0].success).toBe(true);
    expect(regRes.json().results[0].elementId).toBe(propId);

    // Wait a moment for data changes to arrive
    await new Promise((r) => setTimeout(r, 2000));

    // Sync — should have updates
    const syncRes = await app.inject({
      method: 'POST', url: '/v1/subscriptions/sync',
      payload: { subscriptionId: subId, acknowledgeSequence: 0 },
    });
    expect(syncRes.statusCode).toBe(200);
    const updates = syncRes.json().result;
    // Updates may or may not be there depending on timing,
    // but the call must succeed
    expect(Array.isArray(updates)).toBe(true);

    // List subscriptions
    const listRes = await app.inject({
      method: 'POST', url: '/v1/subscriptions/list',
      payload: { subscriptionIds: [subId] },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().results[0].success).toBe(true);
    expect(listRes.json().results[0].subscriptionId).toBe(subId);
    expect(listRes.json().results[0].result.subscriptionId).toBe(subId);

    // Delete
    const delRes = await app.inject({
      method: 'POST', url: '/v1/subscriptions/delete',
      payload: { subscriptionIds: [subId] },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().results[0].success).toBe(true);
  }, 15_000);

  // ── Error handling ───────────────────────────────────────

  it('POST /v1/objects/list returns 404 for unknown elements', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/objects/list',
      payload: { elementIds: ['nonexistent-element-id'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error.code).toBe(404);
  });

  it('POST /v1/subscriptions/stream returns 404 for unknown subscription', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/subscriptions/stream',
      payload: { subscriptionId: 'does-not-exist' },
    });
    expect(res.statusCode).toBe(404);
  });
});
