import {consoleLogger,HistoryService,
  ModelService, 
  SubscriptionService, ValueService, 
} from '@node-i3x/core';
import { OpcUaClient, OpcUaDataSourceAdapter } from '@node-i3x/opcua-connector';
import { createApp } from '@node-i3x/rest-server';
import { config } from './config.js';

async function main(): Promise<void> {
  const logger = consoleLogger;
  logger.info('node-i3x starting...');
  logger.info(`OPC UA endpoint: ${config.opcuaEndpoint}`);

  // 1. Outbound adapter (OPC UA)
  const opcuaClient = new OpcUaClient({
    endpointUrl: config.opcuaEndpoint,
    securityMode: config.opcuaSecurityMode,
    optimizedClient: config.opcuaOptimizedClient,
  }, logger);
  const dataSource = new OpcUaDataSourceAdapter(opcuaClient, logger);

  // 2. Domain services (inject the port)
  const modelService = new ModelService(dataSource, logger);
  const valueService = new ValueService(dataSource, modelService, logger);
  const historyService = new HistoryService(dataSource, modelService, logger);
  const subscriptionService = new SubscriptionService(
    dataSource, modelService, logger, config.subscriptionIntervalSeconds,
  );

  // 3. Inbound adapter (REST)
  const app = await createApp({
    dataSource, modelService, valueService,
    historyService, subscriptionService, logger,
  });

  // 4. Connect & preload
  if (!config.skipOpcuaConnect) {
    await dataSource.connect();
    if (config.modelPreloadOnStartup) {
      try {
        await modelService.preloadModel();
      } catch (err) {
        logger.error(`Model preload failed: ${err}`);
        if (config.failStartupOnModelPreloadError) process.exit(1);
      }
    }
  } else {
  }

  // 5. Start HTTP server
  await app.listen({ port: config.port, host: config.host });
  logger.info(`node-i3x listening on http://${config.host}:${config.port}`);

  // 6. Graceful shutdown
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

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
