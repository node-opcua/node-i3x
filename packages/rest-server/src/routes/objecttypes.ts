import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDeps } from '../app.js';
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
      const { namespaceUri } = req.query;
      const types = await deps.typeService.getObjectTypes(namespaceUri);
      return { success: true, result: types };
    },
  );

  app.post(
    '/v1/objecttypes/query',
    {
      schema: {
        body: {
          type: 'object',
          required: ['elementIds'],
          properties: {
            elementIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: { elementIds: string[] } }>) => {
      const { elementIds } = req.body;
      const found = await deps.typeService.queryObjectTypes(elementIds);

      const results = elementIds.map((eid, i) => {
        const typeNode = found[i];
        if (!typeNode) {
          return bulkError(eid, 404, 'Object type not found');
        }
        return bulkSuccess(eid, typeNode);
      });

      return bulkResponse(results);
    },
  );
}
