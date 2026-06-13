import { randomBytes } from 'node:crypto';
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

/**
 * Send a structured progress message to the parent process (IPC)
 * and also log it to stdout. When run standalone (no parent),
 * process.send is undefined and only the console.log fires.
 */
function sendProgress(
  phase: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const msg = {
    type: 'progress' as const,
    phase,
    message,
    timestamp: Date.now(),
    ...extra,
  };
  if (typeof process.send === 'function') {
    process.send(msg);
  }
}

export async function startServer(config: I3xConfig, version: string): Promise<void> {
  const logger = consoleLogger;

  sendProgress('initializing', 'Creating OPC UA client...');

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
  sendProgress('creating-rest', 'Creating REST API server...');

  // Resolve API key: 'auto' generates a random key
  let apiKey = config.apiKey;
  if (apiKey === 'auto') {
    apiKey = `i3x_sk_${randomBytes(16).toString('hex')}`;
  }
  if (apiKey) {
    logger.info(`API authentication enabled (Bearer token)`);
  }

  const app = await createApp({
    dataSource,
    modelService,
    typeService,
    valueService,
    historyService,
    subscriptionService,
    logger,
    readOnly: config.readOnly,
    apiKey,
    getOpcuaStats: () => opcuaClient.getStats(),
  });

  // 4. Connect to OPC UA
  sendProgress('connecting', `Connecting to ${config.endpoint}...`);
  await dataSource.connect();
  sendProgress('connected', 'OPC UA session established');

  // 5. Preload model
  let nodeCount: number | undefined;
  if (config.modelPreload) {
    try {
      sendProgress('preloading-model', 'Preloading object model...');
      const model = await modelService.preloadModel();
      nodeCount = model.nodesById.size;
      sendProgress('model-loaded', `Model loaded: ${nodeCount} nodes`, { nodeCount });

      sendProgress('preloading-types', 'Preloading type definitions...');
      await typeService.preloadTypes();
      sendProgress('types-loaded', 'Type definitions loaded');
    } catch (err) {
      sendProgress('error', `Model preload failed: ${String(err)}`);
      logger.error(`Model preload failed: ${String(err)}`);
      if (config.failOnPreloadError) process.exit(1);
    }
  }

  // 6. Start HTTP server
  sendProgress('starting-http', 'Starting HTTP server...');
  await app.listen({ port: config.port, host: config.host });
  sendProgress('ready', `Server listening on ${config.host}:${config.port}`, {
    port: config.port,
    host: config.host,
    apiKey,
    opcuaStartupStats: opcuaClient.getStats(),
  });

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
