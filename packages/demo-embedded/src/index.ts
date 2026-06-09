// ─────────────────────────────────────────────────────────────
// i3X Embedded Demo
//
// Creates an OPC UA server + i3X REST API in a SINGLE process.
// No TCP round-trip — PseudoSession talks directly to the
// AddressSpace in memory.
// ─────────────────────────────────────────────────────────────

import {
  consoleLogger,
  HistoryService,
  ModelService,
  SubscriptionService,
  ValueService,
} from '@node-i3x/core';
import { PseudoSessionDataSourceAdapter } from '@node-i3x/pseudo-session-connector';
import { createApp } from '@node-i3x/rest-server';
import { DataType, nodesets, OPCUAServer, type UAVariable, Variant } from 'node-opcua';

const REST_PORT = 8080;
const OPCUA_PORT = 48410;

// ── Helper: update a variable and fire value_changed ──────

function setVar(v: UAVariable, dataType: DataType, val: unknown) {
  v.setValueFromSource(new Variant({ dataType, value: val }));
}

// ── 1. Create an OPC UA server with sample nodes ─────────

async function createSampleServer() {
  const server = new OPCUAServer({
    port: OPCUA_PORT,
    resourcePath: '/UA/EmbeddedDemo',
    nodeset_filename: [nodesets.standard],
    serverInfo: {
      applicationName: { text: 'i3X Embedded Demo' },
    },
  });

  await server.initialize();
  const addressSpace = server.engine.addressSpace!;
  const ns = addressSpace.getOwnNamespace();

  // ── Factory floor ────────────────────────────────────
  const factory = ns.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'SmartFactory',
    displayName: 'Smart Factory',
  });

  // ── Pump ─────────────────────────────────────────────
  const pump = ns.addObject({
    componentOf: factory,
    browseName: 'Pump',
    displayName: 'Main Coolant Pump',
  });

  const pumpTempVar = ns.addVariable({
    componentOf: pump,
    browseName: 'Temperature',
    displayName: 'Temperature (°C)',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 35.0,
    }),
  });

  const pumpPressVar = ns.addVariable({
    componentOf: pump,
    browseName: 'Pressure',
    displayName: 'Pressure (bar)',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 4.2,
    }),
  });

  const pumpFlowVar = ns.addVariable({
    componentOf: pump,
    browseName: 'FlowRate',
    displayName: 'Flow Rate (L/min)',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 120.5,
    }),
  });

  const _pumpRunVar = ns.addVariable({
    componentOf: pump,
    browseName: 'Running',
    displayName: 'Running',
    dataType: DataType.Boolean,
    value: new Variant({
      dataType: DataType.Boolean,
      value: true,
    }),
  });

  // ── Heater ───────────────────────────────────────────
  const heater = ns.addObject({
    componentOf: factory,
    browseName: 'Heater',
    displayName: 'Process Heater',
  });

  const heaterOnVar = ns.addVariable({
    componentOf: heater,
    browseName: 'HeaterOn',
    displayName: 'Heater On/Off',
    dataType: DataType.Boolean,
    value: new Variant({
      dataType: DataType.Boolean,
      value: true,
    }),
  });

  const heaterTempVar = ns.addVariable({
    componentOf: heater,
    browseName: 'Temperature',
    displayName: 'Temperature (°C)',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 180.0,
    }),
  });

  const _heaterSetpointVar = ns.addVariable({
    componentOf: heater,
    browseName: 'Setpoint',
    displayName: 'Setpoint (°C)',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 200.0,
    }),
  });

  const heaterPowerVar = ns.addVariable({
    componentOf: heater,
    browseName: 'Power',
    displayName: 'Power (%)',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 85.0,
    }),
  });

  // ── Conveyor ─────────────────────────────────────────
  const conveyor = ns.addObject({
    componentOf: factory,
    browseName: 'Conveyor',
    displayName: 'Assembly Conveyor',
  });

  const convSpeedVar = ns.addVariable({
    componentOf: conveyor,
    browseName: 'Speed',
    displayName: 'Speed (m/s)',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 2.3,
    }),
  });

  const itemCountVar = ns.addVariable({
    componentOf: conveyor,
    browseName: 'ItemCount',
    displayName: 'Items Processed',
    dataType: DataType.UInt32,
    value: new Variant({
      dataType: DataType.UInt32,
      value: 8452,
    }),
  });

  // ── Simulation (setValueFromSource → fires events) ───

  // Mutable state for simulation
  let pumpTemp = 35.0;
  let pumpPressure = 4.2;
  let pumpFlowRate = 120.5;
  let heaterOn = true;
  let heaterTemp = 180.0;
  let heaterPower = 85.0;
  let convSpeed = 2.3;
  let itemCount = 8452;

  // Pump: temperature, pressure, flow drift every 800ms
  setInterval(() => {
    pumpTemp += (Math.random() - 0.48) * 0.5;
    pumpPressure += (Math.random() - 0.5) * 0.1;
    pumpPressure = Math.max(3.0, Math.min(6.0, pumpPressure));
    pumpFlowRate += (Math.random() - 0.5) * 2.0;
    pumpFlowRate = Math.max(100, Math.min(140, pumpFlowRate));

    setVar(pumpTempVar, DataType.Double, pumpTemp);
    setVar(pumpPressVar, DataType.Double, pumpPressure);
    setVar(pumpFlowVar, DataType.Double, pumpFlowRate);
  }, 800);

  // Heater: temp tracks setpoint, power varies
  setInterval(() => {
    if (heaterOn) {
      heaterTemp += (200.0 - heaterTemp) * 0.05 + (Math.random() - 0.5) * 0.3;
      heaterPower = Math.max(0, Math.min(100, heaterPower + (Math.random() - 0.5) * 5));
    } else {
      heaterTemp -= 1.5 + Math.random() * 0.5;
      heaterPower = 0;
    }
    setVar(heaterTempVar, DataType.Double, heaterTemp);
    setVar(heaterPowerVar, DataType.Double, heaterPower);
  }, 1000);

  // Toggle heater every ~15 seconds
  setInterval(() => {
    heaterOn = !heaterOn;
    setVar(heaterOnVar, DataType.Boolean, heaterOn);
  }, 15_000);

  // Conveyor: items increase, speed varies
  setInterval(() => {
    itemCount += Math.floor(Math.random() * 3);
    convSpeed += (Math.random() - 0.5) * 0.1;
    convSpeed = Math.max(1.5, Math.min(3.5, convSpeed));

    setVar(convSpeedVar, DataType.Double, convSpeed);
    setVar(itemCountVar, DataType.UInt32, itemCount);
  }, 1200);

  await server.start();

  return { server, addressSpace };
}

// ── 2. Wire everything together ──────────────────────────

async function main() {
  const logger = consoleLogger;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  🏭 i3X Embedded Demo — PseudoSession Connector');
  console.log('═'.repeat(60));

  // Create the OPC UA server
  console.log('\n▶ Starting OPC UA server...');
  const { server, addressSpace } = await createSampleServer();
  console.log(
    `  ✓ OPC UA binary endpoint at ` +
      `opc.tcp://localhost:${OPCUA_PORT}/UA/EmbeddedDemo`,
  );

  // ┌──────────────────────────────────────────────────────┐
  // │ THIS IS THE KEY PART — 3 lines to connect i3X       │
  // │ directly to the AddressSpace, no network needed.     │
  // └──────────────────────────────────────────────────────┘
  console.log('\n▶ Connecting i3X via PseudoSession...');
  const dataSource = new PseudoSessionDataSourceAdapter(addressSpace, logger);
  await dataSource.connect();
  console.log('  ✓ Connected — zero-network, in-process');

  // Domain services (identical to the remote OPC UA path)
  const modelService = new ModelService(dataSource, logger);
  const valueService = new ValueService(dataSource, modelService, logger);
  const historyService = new HistoryService(dataSource, modelService, logger);
  const subscriptionService = new SubscriptionService(
    dataSource,
    modelService,
    logger,
    1,
  );

  // Preload the model
  console.log('\n▶ Building i3X model from AddressSpace...');
  const model = await modelService.preloadModel();
  console.log(
    `  ✓ ${model.nodesById.size} nodes, ` +
      `${model.rootIds.length} roots, ` +
      `${model.propertyToSource.size} properties`,
  );

  // Start REST server
  const app = await createApp({
    dataSource,
    modelService,
    valueService,
    historyService,
    subscriptionService,
    logger,
  });
  await app.listen({ port: REST_PORT, host: '127.0.0.1' });

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🚀 i3X REST API ready at http://127.0.0.1:${REST_PORT}`);
  console.log('═'.repeat(60));
  console.log('\n  Try these:');
  console.log(`    curl http://localhost:${REST_PORT}/health`);
  console.log(`    curl http://localhost:${REST_PORT}/v1/info`);
  console.log(`    curl http://localhost:${REST_PORT}/v1/namespaces`);
  console.log(`    curl -X POST http://localhost:${REST_PORT}/v1/objects/list`);
  console.log(
    `\n  OPC UA clients can also connect to ` +
      `opc.tcp://localhost:${OPCUA_PORT}/UA/EmbeddedDemo`,
  );
  console.log('\n  Press Ctrl+C to stop.\n');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n\nShutting down...');
    await app.close();
    await subscriptionService.close();
    await dataSource.disconnect();
    await server.shutdown(500);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
