// ─────────────────────────────────────────────────────────────
// @node-i3x/rest-server — Fastify app factory
// ─────────────────────────────────────────────────────────────

import compress from '@fastify/compress';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';

// Augment Fastify so `app.deps` is typed without casts.
declare module 'fastify' {
  interface FastifyInstance {
    deps: RestServerDeps;
  }
}

import type {
  HistoryService,
  IDataSourcePort,
  ILogger,
  ModelService,
  SubscriptionService,
  TypeService,
  ValueService,
} from '@node-i3x/core';
import { registerErrorHandler } from './errors.js';
import { registerAuth } from './middleware/auth.js';
import requestIdPlugin from './middleware/request-id.js';
import healthRoutes from './routes/health.js';
import infoRoutes from './routes/info.js';
import namespaceRoutes from './routes/namespaces.js';
import objectRoutes from './routes/objects.js';
import objecttypeRoutes from './routes/objecttypes.js';
import relationshiptypeRoutes from './routes/relationshiptypes.js';
import subscriptionRoutes from './routes/subscriptions.js';

export interface RestServerDeps {
  dataSource: IDataSourcePort;
  modelService: ModelService;
  typeService: TypeService;
  valueService: ValueService;
  historyService: HistoryService;
  subscriptionService: SubscriptionService;
  logger: ILogger;
  readOnly?: boolean;
  apiKey?: string;
}

export async function createApp(deps: RestServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Make deps available to all routes via Fastify's decorate API.
  app.decorate('deps', deps);

  await app.register(requestIdPlugin);
  await app.register(cors, { origin: true });
  await app.register(compress, {
    global: true,
    threshold: 0,
    encodings: ['gzip', 'identity'],
  });

  // Register error handler
  registerErrorHandler(app);

  // Register auth middleware (no-op when apiKey is undefined)
  registerAuth(app, deps.apiKey);

  // Brand every response with X-Powered-By header
  app.addHook('onRequest', async (_req, reply) => {
    reply.header('X-Powered-By', 'node-i3x (Sterfive - https://sterfive.com)');
  });

  // Register routes
  await app.register(infoRoutes);
  await app.register(healthRoutes);
  await app.register(namespaceRoutes);
  await app.register(objecttypeRoutes);
  await app.register(relationshiptypeRoutes);
  await app.register(objectRoutes);
  await app.register(subscriptionRoutes);

  return app;
}
