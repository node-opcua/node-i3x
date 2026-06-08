import type { FastifyInstance } from 'fastify';
import type { RestServerDeps } from '../app.js';

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  const deps: RestServerDeps = (app as Record<string, unknown>).deps as RestServerDeps;

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_req, reply) => {
    const connected = deps.dataSource.isConnected();
    if (connected) return { status: 'ready' };
    reply.status(503);
    return { status: 'not ready', message: 'Data source not connected' };
  });
}
