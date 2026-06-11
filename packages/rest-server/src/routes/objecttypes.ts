import { stableI3xId } from '@node-i3x/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDeps } from '../errors.js';

export default async function objecttypeRoutes(app: FastifyInstance): Promise<void> {
  const deps = getDeps(app);

  app.get(
    '/v1/objecttypes',
    async (
      req: FastifyRequest<{
        Querystring: { namespaceUri?: string };
      }>,
    ) => {
      const types = await deps.dataSource.getObjectTypes();
      const { namespaceUri } = req.query;

      const mapped = types.map((t) => ({
        elementId: stableI3xId(`nsu=${t.namespaceUri}:${t.displayName}`, 'asset'),
        displayName: t.displayName,
        namespaceUri: t.namespaceUri,
        sourceTypeId: t.sourceNodeId,
        version: null,
        schema: {},
        related: null,
      }));

      mapped.push({
        elementId: 'UnknownType',
        displayName: 'UnknownType',
        namespaceUri: 'http://opcfoundation.org/UA/',
        sourceTypeId: 'ns=0;i=58',
        version: null,
        schema: {},
        related: null,
      });

      const filtered = namespaceUri
        ? mapped.filter((t) => t.namespaceUri === namespaceUri)
        : mapped;

      return {
        success: true,
        result: filtered,
      };
    },
  );

  app.post('/v1/objecttypes/query', async (_req, reply) => {
    reply.status(501);
    return { success: false, error: { code: 501, message: 'Not implemented' } };
  });
}
