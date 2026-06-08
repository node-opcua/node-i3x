import type { FastifyInstance } from 'fastify';
import { getDeps } from '../errors.js';
import { stableI3xId } from '@i3x/core';

export default async function objecttypeRoutes(app: FastifyInstance): Promise<void> {
  const deps = getDeps(app);

  app.get('/v1/objecttypes', async () => {
    const types = await deps.dataSource.getObjectTypes();
    return {
      success: true,
      result: types.map((t) => ({
        elementId: stableI3xId(t.sourceNodeId, 'asset'),
        displayName: t.displayName,
        namespaceUri: t.namespaceUri,
        sourceTypeId: t.sourceNodeId,
        version: null,
        schema: {},
        related: null,
      })),
    };
  });

  app.post('/v1/objecttypes/query', async (_req, reply) => {
    reply.status(501);
    return { success: false, error: { code: 501, message: 'Not implemented' } };
  });
}
