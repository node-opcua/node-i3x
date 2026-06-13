import {
  consoleLogger,
  HistoryService,
  ModelService,
  SubscriptionService,
  TypeService,
  ValueService,
} from '@node-i3x/core';
import { OpcUaClient, OpcUaDataSourceAdapter } from '@node-i3x/opcua-connector';
import { createApp } from '@node-i3x/rest-server';
import { printBanner } from './banner.js';
import type { I3xConfig } from './config.js';

export async function startServer(config: I3xConfig, version: string): Promise<void> {
  const logger = consoleLogger;

  // 1. Outbound adapter (OPC UA)
  const opcuaClient = new OpcUaClient(
    {
      endpointUrl: config.endpoint,
      securityMode: config.securityMode,
      optimizedClient: config.optimizedClient,
      username: config.username,
      password: config.password,
    },
    logger,
  );
  const dataSource = new OpcUaDataSourceAdapter(opcuaClient, logger);

  // 2. Domain services (inject the port)
  const modelService = new ModelService(dataSource, logger);
  const valueService = new ValueService(dataSource, modelService, logger);
  const historyService = new HistoryService(dataSource, modelService, logger);
  const subscriptionService = new SubscriptionService(
    dataSource,
    modelService,
    logger,
    config.subscriptionInterval,
  );
  const typeService = new TypeService(dataSource, logger);

  // 3. Inbound adapter (REST)
  const app = await createApp({
    dataSource,
    modelService,
    typeService,
    valueService,
    historyService,
    subscriptionService,
    logger,
    readOnly: config.readOnly,
  });

  // 4. Connect to OPC UA
  await dataSource.connect();

  // 5. Preload model
  let nodeCount: number | undefined;
  if (config.modelPreload) {
    try {
      const model = await modelService.preloadModel();
      nodeCount = model.nodesById.size;
      await typeService.preloadTypes();
    } catch (err) {
      logger.error(`Model preload failed: ${String(err)}`);
      if (config.failOnPreloadError) process.exit(1);
    }
  }

  // 6. Start HTTP server
  await app.listen({ port: config.port, host: config.host });

  // 7. Banner
  printBanner(version, config, nodeCount);

  // 8. Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await app.close();
    await subscriptionService.close();
    await dataSource.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
