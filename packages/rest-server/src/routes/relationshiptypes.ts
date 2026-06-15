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
  app.get(
    '/v1/relationshiptypes',
    async (req: FastifyRequest<{ Querystring: { namespaceUri?: string } }>) => {
      const { namespaceUri } = req.query;
      let types = RELATIONSHIP_TYPES;
      if (namespaceUri) {
        types = types.filter((t) => t.namespaceUri === namespaceUri);
      }
      return {
        success: true,
        result: types,
      };
    },
  );

  app.post(
    '/v1/relationshiptypes/query',
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
