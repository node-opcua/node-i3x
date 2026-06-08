import type { FastifyInstance } from 'fastify';
import { getDeps } from '../errors.js';

export default async function namespaceRoutes(app: FastifyInstance): Promise<void> {
  const deps = getDeps(app);

  app.get('/v1/namespaces', async () => {
    const ns = await deps.dataSource.getNamespaces();
    return {
      success: true,
      result: ns.map((n) => ({ uri: n.uri, displayName: n.displayName })),
    };
  });
}
