import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDeps } from '../errors.js';
import { stableI3xId } from '@i3x/core';

export default async function objecttypeRoutes(app: FastifyInstance): Promise<void> {
  const deps = getDeps(app);

  app.get('/v1/objecttypes', async (req: FastifyRequest<{
    Querystring: { namespaceUri?: string };
  }>) => {
    const types = await deps.dataSource.getObjectTypes();
    const { namespaceUri } = req.query;

    const filtered = namespaceUri
      ? types.filter((t) => t.namespaceUri === namespaceUri)
      : types;

    return {
      success: true,
      result: filtered.map((t) => ({
        elementId: stableI3xId(
          `nsu=${t.namespaceUri}:${t.displayName}`, 'asset',
        ),
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
