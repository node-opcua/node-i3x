import type { RelationshipType } from '@node-i3x/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { bulkError, bulkResponse, bulkSuccess } from '../helpers/response.js';

const RELATIONSHIP_TYPES: RelationshipType[] = [
  {
    elementId: 'HasComponent',
    displayName: 'HasComponent',
    namespaceUri: 'http://opcfoundation.org/UA/',
    relationshipId: 'ns=0;i=47',
    reverseOf: 'IsComponentOf',
  },
  {
    elementId: 'IsComponentOf',
    displayName: 'IsComponentOf',
    namespaceUri: 'http://opcfoundation.org/UA/',
    relationshipId: 'ns=0;i=47',
    reverseOf: 'HasComponent',
  },
];

export default async function relationshiptypeRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get('/v1/relationshiptypes', async () => {
    return {
      success: true,
      result: RELATIONSHIP_TYPES,
    };
  });

  app.post(
    '/v1/relationshiptypes/query',
    async (req: FastifyRequest<{ Body: { elementIds: string[] } }>) => {
      const { elementIds } = req.body;
      const results = elementIds.map((eid) => {
        const typeNode = RELATIONSHIP_TYPES.find((t) => t.elementId === eid);
        if (!typeNode) {
          return bulkError(eid, 404, 'Relationship type not found');
        }
        return bulkSuccess(eid, typeNode);
      });
      return bulkResponse(results);
    },
  );
}
