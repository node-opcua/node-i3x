// ─────────────────────────────────────────────────────────────
// Demo: Start a representative OPC UA server + i3X REST API
// ─────────────────────────────────────────────────────────────

import {consoleLogger,HistoryService,
  ModelService, 
  SubscriptionService, ValueService, 
} from '@node-i3x/core';
import { OpcUaClient, OpcUaDataSourceAdapter } from '@node-i3x/opcua-connector';
import { createApp } from '@node-i3x/rest-server';
import {DataType, nodesets,
  OPCUAServer, Variant, 
} from 'node-opcua';

const PORT = 8000;
const OPCUA_PORT = 48400;

async function startOpcUaServer() {
  const server = new OPCUAServer({
    port: OPCUA_PORT,
    resourcePath: '/UA/i3xDemo',
    nodeset_filename: [nodesets.standard],
    serverInfo: {
      applicationName: { text: 'i3X Demo OPC UA Server' },
      applicationUri: 'urn:i3x:demo',
      productUri: 'urn:i3x:demo',
    },
  });

  await server.initialize();
  const addressSpace = server.engine.addressSpace!;
  const ns = addressSpace.getOwnNamespace();

  // ── Production Line ──────────────────────────────────────
  const line = ns.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'ProductionLine',
    displayName: 'Production Line #1',
  });

  // ── CNC Milling Machine ─────────────────────────────────
  const cnc = ns.addObject({
    componentOf: line,
    browseName: 'CncMachine',
    displayName: 'CNC Milling Machine',
  });

  let cncTemp = 65.2;
  ns.addVariable({
    componentOf: cnc, browseName: 'Temperature',
    displayName: 'Temperature (°C)', dataType: DataType.Double,
    value: { get: () => new Variant({ dataType: DataType.Double, value: cncTemp }) },
  });

  let cncSpeed = 1500;
  ns.addVariable({
    componentOf: cnc, browseName: 'SpindleSpeed',
    displayName: 'Spindle Speed (RPM)', dataType: DataType.Int32,
    value: { get: () => new Variant({ dataType: DataType.Int32, value: cncSpeed }) },
  });

  ns.addVariable({
    componentOf: cnc, browseName: 'Status',
    displayName: 'Status', dataType: DataType.String,
    value: { get: () => new Variant({ dataType: DataType.String, value: 'Running' }) },
  });

  ns.addVariable({
    componentOf: cnc, browseName: 'ToolWear',
    displayName: 'Tool Wear (%)', dataType: DataType.Float,
    value: { get: () => new Variant({ dataType: DataType.Float, value: 37.8 }) },
  });

  // ── Laser Cutter ─────────────────────────────────────────
  const laser = ns.addObject({
    componentOf: line,
    browseName: 'LaserCutter',
    displayName: 'Laser Cutter',
  });

  ns.addVariable({
    componentOf: laser, browseName: 'Temperature',
    displayName: 'Temperature (°C)', dataType: DataType.Double,
    value: { get: () => new Variant({ dataType: DataType.Double, value: 42.7 }) },
  });

  ns.addVariable({
    componentOf: laser, browseName: 'LaserPower',
    displayName: 'Laser Power (W)', dataType: DataType.Float,
    value: { get: () => new Variant({ dataType: DataType.Float, value: 2400.5 }) },
  });

  ns.addVariable({
    componentOf: laser, browseName: 'JobCount',
    displayName: 'Completed Jobs', dataType: DataType.UInt32,
    value: { get: () => new Variant({ dataType: DataType.UInt32, value: 1247 }) },
  });

  // ── Robot Arm ────────────────────────────────────────────
  const robot = ns.addObject({
    componentOf: line,
    browseName: 'RobotArm',
    displayName: 'Assembly Robot Arm',
  });

  ns.addVariable({
    componentOf: robot, browseName: 'JointAngle',
    displayName: 'Joint Angle (deg)', dataType: DataType.Double,
    value: { get: () => new Variant({ dataType: DataType.Double, value: 127.3 }) },
  });

  ns.addVariable({
    componentOf: robot, browseName: 'Payload',
    displayName: 'Current Payload (kg)', dataType: DataType.Float,
    value: { get: () => new Variant({ dataType: DataType.Float, value: 4.2 }) },
  });

  ns.addVariable({
    componentOf: robot, browseName: 'CycleCount',
    displayName: 'Cycle Count', dataType: DataType.UInt32,
    value: { get: () => new Variant({ dataType: DataType.UInt32, value: 84291 }) },
  });

  ns.addVariable({
    componentOf: robot, browseName: 'OperatingMode',
    displayName: 'Operating Mode', dataType: DataType.String,
    value: { get: () => new Variant({ dataType: DataType.String, value: 'Automatic' }) },
  });

  // Simulate live temperature changes
  setInterval(() => { cncTemp += (Math.random() - 0.4) * 1.5; }, 1000);
  setInterval(() => { cncSpeed = 1500 + Math.floor((Math.random() - 0.5) * 100); }, 2000);

  await server.start();
  return server;
}

async function main() {
  const logger = consoleLogger;

  console.log('\n' + '═'.repeat(60));
  console.log('  🏭 node-i3x Demo');
  console.log('═'.repeat(60));

  // 1. Start OPC UA server
  console.log('\n▶ Starting OPC UA test server...');
  const opcuaServer = await startOpcUaServer();
  const endpointUrl = `opc.tcp://localhost:${OPCUA_PORT}/UA/i3xDemo`;
  console.log(`  ✓ OPC UA server ready at ${endpointUrl}`);

  // 2. Connect i3X adapter
  console.log('\n▶ Connecting i3X OPC UA adapter...');
  const client = new OpcUaClient({
    endpointUrl, securityMode: 'None', optimizedClient: 'auto',
  }, logger);
  const dataSource = new OpcUaDataSourceAdapter(client, logger);
  await dataSource.connect();

  // 3. Domain services
  const modelService = new ModelService(dataSource, logger);
  const valueService = new ValueService(dataSource, modelService, logger);
  const historyService = new HistoryService(dataSource, modelService, logger);
  const subscriptionService = new SubscriptionService(dataSource, modelService, logger, 1);

  // 4. Preload model
  console.log('\n▶ Building i3X model from OPC UA...');
  const model = await modelService.preloadModel();
  console.log(`  ✓ Model: ${model.nodesById.size} nodes, ${model.rootIds.length} roots, ${model.propertyToSource.size} properties`);

  // 5. Start REST server
  const app = await createApp({
    dataSource, modelService, valueService,
    historyService, subscriptionService, logger,
  });
  await app.listen({ port: PORT, host: '127.0.0.1' });

  console.log('\n' + '═'.repeat(60));
  console.log(`  🚀 i3X REST API ready at http://127.0.0.1:${PORT}`);
  console.log('═'.repeat(60));
  console.log('\n  Try these endpoints:');
  console.log(`    curl http://localhost:${PORT}/v1/info`);
  console.log(`    curl http://localhost:${PORT}/v1/namespaces`);
  console.log(`    curl http://localhost:${PORT}/v1/objects`);
  console.log(`    curl http://localhost:${PORT}/health`);
  console.log('\n  Press Ctrl+C to stop.\n');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n\nShutting down...');
    await app.close();
    await subscriptionService.close();
    await dataSource.disconnect();
    await opcuaServer.shutdown(500);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
