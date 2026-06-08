import type { FastifyInstance } from 'fastify';
import type { RestServerDeps } from '../app.js';

export default async function namespaceRoutes(app: FastifyInstance): Promise<void> {
  const deps: RestServerDeps = (app as Record<string, unknown>).deps as RestServerDeps;

  app.get('/v1/namespaces', async () => {
    const ns = await deps.dataSource.getNamespaces();
    return {
      success: true,
      result: ns.map((n) => ({ uri: n.uri, displayName: n.displayName })),
    };
  });
}
