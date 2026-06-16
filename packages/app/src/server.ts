import { randomBytes } from 'node:crypto';
import { consoleLogger, createI3xStack } from '@node-i3x/core';
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
      securityMode: config.securityMode as 'None' | 'Sign' | 'SignAndEncrypt' | 'Auto',
      securityPolicy: config.securityPolicy,
      pkiFolder: config.pkiFolder,
      certificateSubject: config.certificateSubject,
      optimizedClient: config.optimizedClient,
      username: config.username,
      password: config.password,
    },
    logger,
  );
  const dataSource = new OpcUaDataSourceAdapter(opcuaClient, logger);

  // 2. Domain services (inject the port)
  const { modelService, valueService, historyService, subscriptionService, typeService } =
    createI3xStack(dataSource, logger, {
      publishIntervalMs: config.publishIntervalMs,
      samplingIntervalMs: config.samplingIntervalMs,
    });

  // 3. Inbound adapter (REST)
  sendProgress('creating-rest', 'Creating REST API server...');

  // Resolve API key: 'auto' generates a random key
  let apiKey = config.apiKey;
  if (apiKey === 'auto') {
    apiKey = `i3x_sk_${randomBytes(16).toString('hex')}`;
  }

  // Guard: requireAuth demands an apiKey
  if (config.requireAuth && !apiKey) {
    logger.error(
      'requireAuth is enabled but no apiKey is configured. ' +
        'Set --api-key <key> (or "auto") to enable Bearer ' +
        'token authentication, or disable requireAuth.',
    );
    process.exit(1);
  }

  if (apiKey) {
    const mode = config.requireAuth ? 'enforced' : 'enabled';
    logger.info(`API authentication ${mode} (Bearer token)`);
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
    experimental: config.experimental,
    getOpcuaStats: () => opcuaClient.getStats(),
  });

  // Graceful shutdown registration
  let isListening = false;
  const shutdown = async () => {
    logger.info('Shutting down...');
    if (isListening) {
      try {
        await app.close();
      } catch (err) {
        logger.debug(`Failed to close http server: ${(err as Error).message}`);
      }
    }
    try {
      await subscriptionService.close();
    } catch (err) {
      logger.debug(`Failed to close subscription service: ${(err as Error).message}`);
    }
    try {
      await dataSource.disconnect();
    } catch (err) {
      logger.debug(`Failed to disconnect datasource: ${(err as Error).message}`);
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 4. Connect to OPC UA
  sendProgress('connecting', `Connecting to ${config.endpoint}...`);
  await dataSource.connect();
  sendProgress('connected', 'OPC UA session established');

  // 5. Preload model
  let nodeCount: number | undefined;
  if (config.preload) {
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
      if (config.preloadStrict) process.exit(1);
    }
  }

  // 6. Start HTTP server
  sendProgress('starting-http', 'Starting HTTP server...');
  await app.listen({ port: config.port, host: config.host });
  isListening = true;
  sendProgress('ready', `Server listening on ${config.host}:${config.port}`, {
    port: config.port,
    host: config.host,
    apiKey,
    opcuaStartupStats: opcuaClient.getStats(),
  });

  // 7. Banner
  printBanner(version, config, nodeCount);
}
