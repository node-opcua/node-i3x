// ─────────────────────────────────────────────────────────────
// i3X Remote Demo (for comparison)
//
// Same OPC UA server, same REST API — but connected via
// OPC UA binary transport (ClientSession over TCP).
//
// Run this side-by-side with the embedded demo to see
// the architectural difference.
// ─────────────────────────────────────────────────────────────

import { consoleLogger, createI3xStack } from '@node-i3x/core';
import { OpcUaClient, OpcUaDataSourceAdapter } from '@node-i3x/opcua-connector';
import { createApp } from '@node-i3x/rest-server';
import { DataType, nodesets, OPCUAServer, Variant } from 'node-opcua';

const REST_PORT = 8080;
const OPCUA_PORT = 48411;

async function createSameServer() {
  const server = new OPCUAServer({
    port: OPCUA_PORT,
    resourcePath: '/UA/RemoteDemo',
    nodeset_filename: [nodesets.standard],
  });
  await server.initialize();
  const addressSpace = server.engine.addressSpace;
  if (!addressSpace) {
    throw new Error('Address space not initialized');
  }
  const ns = addressSpace.getOwnNamespace();

  const factory = ns.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'SmartFactory',
    displayName: 'Smart Factory',
  });
  const pump = ns.addObject({
    componentOf: factory,
    browseName: 'Pump',
    displayName: 'Main Coolant Pump',
  });
  ns.addVariable({
    componentOf: pump,
    browseName: 'Temperature',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 35.0,
    }),
  });
  ns.addVariable({
    componentOf: pump,
    browseName: 'FlowRate',
    dataType: DataType.Double,
    value: new Variant({
      dataType: DataType.Double,
      value: 120.5,
    }),
  });
  ns.addVariable({
    componentOf: pump,
    browseName: 'Status',
    dataType: DataType.String,
    value: new Variant({
      dataType: DataType.String,
      value: 'Running',
    }),
  });

  await server.start();
  return server;
}

async function main() {
  const logger = consoleLogger;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  🏭 i3X Remote Demo — OPC UA Binary Transport');
  console.log('═'.repeat(60));

  const server = await createSameServer();
  const endpointUrl = `opc.tcp://localhost:${OPCUA_PORT}/UA/RemoteDemo`;
  console.log(`\n  OPC UA server at ${endpointUrl}`);

  // ┌──────────────────────────────────────────────────────┐
  // │ REMOTE path: connect via OPC UA binary protocol      │
  // │ Requires TCP connection, serialization, etc.         │
  // └──────────────────────────────────────────────────────┘
  const client = new OpcUaClient(
    {
      endpointUrl,
      securityMode: 'None',
      optimizedClient: 'disabled',
    },
    logger,
  );
  const dataSource = new OpcUaDataSourceAdapter(client, logger);
  await dataSource.connect();

  const { modelService, typeService, valueService, historyService, subscriptionService } =
    createI3xStack(dataSource, logger, {
      publishIntervalMs: 1000,
      samplingIntervalMs: 250,
    });

  const model = await modelService.preloadModel();
  console.log(
    `  Model: ${model.nodesById.size} nodes, ` + `${model.rootIds.length} roots`,
  );

  const app = await createApp({
    dataSource,
    modelService,
    typeService,
    valueService,
    historyService,
    subscriptionService,
    logger,
  });
  await app.listen({ port: REST_PORT, host: '127.0.0.1' });

  console.log(`\n  🚀 REST API at http://127.0.0.1:${REST_PORT}`);
  console.log('  Press Ctrl+C to stop.\n');

  const shutdown = async () => {
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
