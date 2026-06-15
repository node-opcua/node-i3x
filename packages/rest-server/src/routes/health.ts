import type { FastifyInstance } from 'fastify';
import { getDeps } from '../app.js';

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  const deps = getDeps(app);

  app.get('/health', async () => {
    const opcua = deps.getOpcuaStats?.();
    return { status: 'ok', ...(opcua ? { opcua } : {}) };
  });

  app.get('/ready', async (_req, reply) => {
    const connected = deps.dataSource.isConnected();
    if (connected) return { status: 'ready' };
    reply.status(503);
    return { status: 'not ready', message: 'Data source not connected' };
  });
}
