import { stableI3xId } from '@node-i3x/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDeps } from '../errors.js';
import { bulkError, bulkResponse, bulkSuccess } from '../helpers/response.js';

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
        elementId: stableI3xId(`nsu=${t.namespaceUri}:${t.displayName}`, 'type'),
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

  app.post(
    '/v1/objecttypes/query',
    async (req: FastifyRequest<{ Body: { elementIds: string[] } }>) => {
      const { elementIds } = req.body;
      const types = await deps.dataSource.getObjectTypes();

      const mapped = types.map((t) => ({
        elementId: stableI3xId(`nsu=${t.namespaceUri}:${t.displayName}`, 'type'),
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

      const results = elementIds.map((eid) => {
        const typeNode = mapped.find((t) => t.elementId === eid);
        if (!typeNode) {
          return bulkError(eid, 404, 'Object type not found');
        }
        return bulkSuccess(eid, typeNode);
      });

      return bulkResponse(results);
    },
  );
}
