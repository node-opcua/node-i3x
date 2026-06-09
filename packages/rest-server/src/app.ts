// ─────────────────────────────────────────────────────────────
// @i3x/rest-server — Fastify app factory
// ─────────────────────────────────────────────────────────────

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

// Augment Fastify so `app.deps` is typed without casts.
declare module 'fastify' {
  interface FastifyInstance {
    deps: RestServerDeps;
  }
}
import type {
  IDataSourcePort,
  ILogger,
  ModelService,
  ValueService,
  HistoryService,
  SubscriptionService,
} from '@i3x/core';
import { registerErrorHandler } from './errors.js';
import requestIdPlugin from './middleware/request-id.js';
import infoRoutes from './routes/info.js';
import healthRoutes from './routes/health.js';
import namespaceRoutes from './routes/namespaces.js';
import objecttypeRoutes from './routes/objecttypes.js';
import relationshiptypeRoutes from './routes/relationshiptypes.js';
import objectRoutes from './routes/objects.js';
import subscriptionRoutes from './routes/subscriptions.js';

export interface RestServerDeps {
  dataSource: IDataSourcePort;
  modelService: ModelService;
  valueService: ValueService;
  historyService: HistoryService;
  subscriptionService: SubscriptionService;
  logger: ILogger;
}

export async function createApp(deps: RestServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Make deps available to all routes via Fastify's decorate API.
  app.decorate('deps', deps);

  await app.register(requestIdPlugin);
  await app.register(cors, { origin: true });

  // Register error handler
  registerErrorHandler(app);

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
