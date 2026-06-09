import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDeps, i3xError } from '../errors.js';
import {
  bulkError,
  bulkSuccess,
  successResponse,
  toObjectInstance,
} from '../helpers/response.js';

export default async function objectRoutes(app: FastifyInstance): Promise<void> {
  const deps = getDeps(app);

  // ── GET /v1/objects ────────────────────────────────────────
  app.get(
    '/v1/objects',
    async (
      req: FastifyRequest<{
        Querystring: {
          typeElementId?: string;
          includeMetadata?: boolean;
          root?: boolean;
        };
      }>,
    ) => {
      const model = await deps.modelService.getOrBuildModel();
      const { typeElementId, root } = req.query;

      let nodes: Array<{
        id: string;
        name: string;
        type?: string | null;
        children: readonly string[];
      }>;

      if (root) {
        nodes = model.rootIds
          .map((id) => model.nodesById.get(id))
          .filter(Boolean) as Array<{
          id: string;
          name: string;
          type?: string | null;
          children: readonly string[];
        }>;
      } else {
        nodes = Array.from(model.nodesById.values());
      }

      if (typeElementId) {
        nodes = nodes.filter((n) => n.type === typeElementId);
      }

      const result = nodes.map((node) =>
        toObjectInstance(node, deps.modelService.parentIdOf(model, node.id)),
      );
      return successResponse(result);
    },
  );

  // ── POST /v1/objects/list ──────────────────────────────────
  app.post(
    '/v1/objects/list',
    async (req: FastifyRequest<{ Body: { elementIds: string[] } }>) => {
      const { elementIds } = req.body;
      const model = await deps.modelService.getOrBuildModel();
      const results = elementIds.map((id) => {
        const node = deps.modelService.findNode(model, id);
        if (!node) return bulkError(id, 404, 'Not found');
        return bulkSuccess(
          id,
          toObjectInstance(node, deps.modelService.parentIdOf(model, node.id)),
        );
      });
      return { success: true, results };
    },
  );

  // ── POST /v1/objects/related ───────────────────────────────
  // Spec: { elementIds: [...] } → BulkResponse<List<RelatedObjectResult>>
  app.post(
    '/v1/objects/related',
    async (
      req: FastifyRequest<{
        Body: {
          elementIds: string[];
          relationshipType?: string | null;
          includeMetadata?: boolean;
        };
      }>,
    ) => {
      const { elementIds } = req.body;
      const model = await deps.modelService.getOrBuildModel();

      const results = elementIds.map((eid) => {
        const node = deps.modelService.findNode(model, eid);
        if (!node) {
          return bulkError(eid, 404, 'Not found');
        }

        // Collect children as "HasComponent" relationships
        const childIds = model.childrenById.get(node.id) ?? [];
        const relatedObjects = childIds
          .map((cId) => model.nodesById.get(cId))
          .filter(Boolean)
          .map((child) => ({
            sourceRelationship: 'HasComponent',
            object: toObjectInstance(child!, node.id),
          }));

        // Also include parent as reverse relationship
        const parentId = deps.modelService.parentIdOf(model, node.id);
        if (parentId) {
          const parent = model.nodesById.get(parentId);
          if (parent) {
            relatedObjects.push({
              sourceRelationship: 'IsComponentOf',
              object: toObjectInstance(
                parent,
                deps.modelService.parentIdOf(model, parent.id),
              ),
            });
          }
        }

        return bulkSuccess(eid, relatedObjects);
      });

      return { success: true, results };
    },
  );

  // ── POST /v1/objects/value ─────────────────────────────────
  app.post(
    '/v1/objects/value',
    async (
      req: FastifyRequest<{ Body: { elementIds: string[]; maxDepth?: number } }>,
    ) => {
      const { elementIds, maxDepth } = req.body;
      const results = await deps.valueService.readValues(elementIds, maxDepth ?? 1);
      return { success: true, results };
    },
  );

  // ── POST /v1/objects/history ───────────────────────────────
  app.post(
    '/v1/objects/history',
    async (
      req: FastifyRequest<{
        Body: {
          elementIds: string[];
          startTime?: string;
          endTime?: string;
          maxDepth?: number;
        };
      }>,
    ) => {
      const { elementIds, startTime, endTime } = req.body;
      const results = await deps.historyService.readHistory(
        elementIds,
        startTime ? new Date(startTime) : null,
        endTime ? new Date(endTime) : null,
      );
      return { success: true, results };
    },
  );

  // ── GET /v1/objects/:elementId/history ─────────────────────
  app.get('/v1/objects/:elementId/history', async (_req, reply) => {
    reply.status(501);
    return { success: false, error: { code: 501, message: 'Not implemented' } };
  });

  // ── PUT /v1/objects/:elementId/history ─────────────────────
  app.put('/v1/objects/:elementId/history', async (_req, reply) => {
    reply.status(501);
    return { success: false, error: { code: 501, message: 'Not implemented' } };
  });

  // ── PUT /v1/objects/:elementId/value ───────────────────────
  app.put(
    '/v1/objects/:elementId/value',
    async (
      req: FastifyRequest<{ Params: { elementId: string }; Body: { value: unknown } }>,
    ) => {
      const { elementId } = req.params;
      const { value } = req.body;
      try {
        await deps.valueService.writeValue(elementId, value);
        return successResponse(null);
      } catch (err) {
        throw i3xError(404, 404, (err as Error).message);
      }
    },
  );
}
