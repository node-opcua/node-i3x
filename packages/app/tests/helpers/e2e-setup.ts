// ─────────────────────────────────────────────────────────────
// E2E shared test infrastructure
//
// Spins up a real OPC UA server with a ProductionLine model
// and boots the full i3X stack (connector → core → REST).
//
// Each test file imports `e2eContext` and calls
// `beforeAll` / `afterAll` with the setup/teardown helpers.
// ─────────────────────────────────────────────────────────────

import {
  consoleLogger,
  createI3xStack,
  type ModelService,
  type SubscriptionService,
} from '@node-i3x/core';
import { OpcUaClient, OpcUaDataSourceAdapter } from '@node-i3x/opcua-connector';
import { createApp } from '@node-i3x/rest-server';
import {
  AccessLevelFlag,
  DataType,
  type Namespace,
  nodesets,
  OPCUAServer,
  StatusCodes,
  Variant,
} from 'node-opcua';

// ── Types ──────────────────────────────────────────────────

export interface E2EContext {
  app: Awaited<ReturnType<typeof createApp>>;
  modelService: ModelService;
  subscriptionService: SubscriptionService;
}

// ── Server factory ─────────────────────────────────────────

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

  const addressSpace = server.engine.addressSpace;
  if (!addressSpace) throw new Error('Address space not initialized');
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
    accessLevel: AccessLevelFlag.CurrentRead | AccessLevelFlag.CurrentWrite,
    userAccessLevel: AccessLevelFlag.CurrentRead | AccessLevelFlag.CurrentWrite,
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: temperatureA }),
      set: (variant: Variant) => {
        temperatureA = variant.value as number;
        return StatusCodes.Good;
      },
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
  const uaResetMethod = namespace.addMethod(machineA, {
    browseName: 'Reset',
    displayName: 'Reset Machine',
    inputArguments: [],
    outputArguments: [],
  });
  uaResetMethod.bindMethod(async (_inputArguments: unknown[], _context: unknown) => {
    temperatureA = 25.0;
    speedA = 0;
    return { statusCode: StatusCodes.Good };
  });

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

  // ── CoffeeMachine (deeply nested for subscription test) ──
  const coffeeMachine = namespace.addObject({
    componentOf: productionLine,
    browseName: 'CoffeeMachine',
    displayName: 'Coffee Machine Pro 3000',
  });

  // ParameterSet (sub-object containing UAVariables)
  const parameterSet = namespace.addObject({
    componentOf: coffeeMachine,
    browseName: 'ParameterSet',
    displayName: 'ParameterSet',
  });

  // All CoffeeMachine variables MONOTONICALLY INCREASE
  // so every OPC UA sample is a guaranteed DataChange
  let brewTemperature = 93.0;
  let _brewTick = 0;
  namespace.addVariable({
    componentOf: parameterSet,
    browseName: 'BrewTemperature',
    displayName: 'Brew Temperature',
    dataType: DataType.Double,
    minimumSamplingInterval: 250,
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Double,
          value: brewTemperature,
        }),
    },
  });

  let pumpPressure = 9.0;
  namespace.addVariable({
    componentOf: parameterSet,
    browseName: 'PumpPressure',
    displayName: 'Pump Pressure',
    dataType: DataType.Double,
    minimumSamplingInterval: 250,
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Double,
          value: pumpPressure,
        }),
    },
  });

  let waterLevel = 100.0;
  namespace.addVariable({
    componentOf: parameterSet,
    browseName: 'WaterLevel',
    displayName: 'Water Level',
    dataType: DataType.Float,
    minimumSamplingInterval: 250,
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Float,
          value: waterLevel,
        }),
    },
  });

  // GrinderUnit — nested 2 levels deep inside CoffeeMachine
  const grinderUnit = namespace.addObject({
    componentOf: coffeeMachine,
    browseName: 'GrinderUnit',
    displayName: 'Grinder Unit',
  });

  let grinderRPM = 1200;
  namespace.addVariable({
    componentOf: grinderUnit,
    browseName: 'RPM',
    displayName: 'Grinder RPM',
    dataType: DataType.Int32,
    minimumSamplingInterval: 250,
    value: {
      get: () => new Variant({ dataType: DataType.Int32, value: grinderRPM }),
    },
  });

  let grindSizeTick = 0;
  const grindSizes = ['Coarse', 'Medium', 'Fine', 'Extra-Fine'];
  namespace.addVariable({
    componentOf: grinderUnit,
    browseName: 'GrindSize',
    displayName: 'Grind Size',
    dataType: DataType.String,
    minimumSamplingInterval: 250,
    value: {
      get: () =>
        new Variant({
          dataType: DataType.String,
          value: grindSizes[grindSizeTick % grindSizes.length],
        }),
    },
  });

  // Monotonically increase every 200ms for clear evidence
  const interval = setInterval(() => {
    _brewTick++;
    temperatureA += 0.5;
    brewTemperature += 0.1; // 93.0 → 93.1 → 93.2 → ...
    pumpPressure += 0.05; //  9.0 →  9.05 →  9.10 → ...
    waterLevel -= 0.3; // 100 → 99.7 → 99.4 → ...
    grinderRPM += 10; // 1200 → 1210 → 1220 → ...
    grindSizeTick++; // cycles through sizes
  }, 200);
  (server as unknown as Record<string, unknown>)._e2eInterval = interval;

  await server.start();
  return server;
}

// ── Setup / Teardown ───────────────────────────────────────

/**
 * Call from `beforeAll` to spin up OPC UA + i3X REST stack.
 * Returns the shared context that tests use.
 */
export async function setupE2E(): Promise<E2EContext> {
  // 1. Start a real OPC UA server
  opcuaServer = await startTestOpcUaServer();
  const endpointUrl = `opc.tcp://localhost:${serverPort}/UA/i3xTest`;

  // 2. Create the connector
  const logger = consoleLogger;
  const opcuaClient = new OpcUaClient(
    {
      endpointUrl,
      securityMode: 'None',
      optimizedClient: 'auto',
    },
    logger,
  );
  const dataSource = new OpcUaDataSourceAdapter(opcuaClient, logger);

  // 3. Domain services
  const stack = createI3xStack(dataSource, logger, {
    publishIntervalMs: 1000,
    samplingIntervalMs: 250,
  });
  const modelService = stack.modelService;
  const subscriptionService = stack.subscriptionService;
  const { valueService, historyService, typeService } = stack;

  // 4. REST server
  const app = await createApp({
    dataSource,
    modelService,
    typeService,
    valueService,
    historyService,
    subscriptionService,
    logger,
  });

  // 5. Connect and preload
  await dataSource.connect();
  await modelService.preloadModel();
  await typeService.preloadTypes();

  return { app, modelService, subscriptionService };
}

/**
 * Call from `afterAll` to tear down OPC UA + i3X REST stack.
 */
export async function teardownE2E(ctx: E2EContext): Promise<void> {
  if (!ctx) return;
  await ctx.subscriptionService.close();
  const ds = (ctx.app as unknown as Record<string, unknown>).deps as Record<
    string,
    { disconnect: () => Promise<void> }
  >;
  if (ds?.dataSource) await ds.dataSource.disconnect();
  clearInterval(
    (opcuaServer as unknown as Record<string, unknown>)._e2eInterval as NodeJS.Timeout,
  );
  await opcuaServer.shutdown(500);
}
