import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RestServerDeps } from '../app.js';
import { i3xError } from '../errors.js';

export default async function objectRoutes(app: FastifyInstance): Promise<void> {
  const deps: RestServerDeps = (app as Record<string, unknown>).deps as RestServerDeps;

  // ── GET /v1/objects ────────────────────────────────────────
  app.get('/v1/objects', async () => {
    const model = await deps.modelService.getOrBuildModel();
    const roots = model.rootIds.map((id) => {
      const node = model.nodesById.get(id);
      return node
        ? { elementId: node.id, displayName: node.name, typeElementId: '', parentId: null, isComposition: true }
        : null;
    }).filter(Boolean);
    return { success: true, result: roots };
  });

  // ── POST /v1/objects/list ──────────────────────────────────
  app.post('/v1/objects/list', async (req: FastifyRequest<{ Body: { elementIds: string[] } }>) => {
    const { elementIds } = req.body;
    const model = await deps.modelService.getOrBuildModel();
    const results = elementIds.map((id) => {
      const node = deps.modelService.findNode(model, id);
      if (!node) return { success: false, elementId: id, error: { code: 404, message: 'Not found' } };
      return {
        success: true, elementId: id,
        result: {
          elementId: node.id, displayName: node.name,
          typeElementId: node.type ?? '', parentId: deps.modelService.parentIdOf(model, node.id),
          isComposition: node.children.length > 0,
          children: (model.childrenById.get(node.id) ?? []).map((cId) => {
            const c = model.nodesById.get(cId);
            return c ? { elementId: c.id, displayName: c.name, kind: c.kind, type: c.type } : null;
          }).filter(Boolean),
        },
      };
    });
    return { success: true, results };
  });

  // ── POST /v1/objects/related ───────────────────────────────
  // Spec: { elementIds: [...] } → BulkResponse<List<RelatedObjectResult>>
  app.post('/v1/objects/related', async (req: FastifyRequest<{
    Body: { elementIds: string[]; relationshipType?: string | null; includeMetadata?: boolean };
  }>) => {
    const { elementIds } = req.body;
    const model = await deps.modelService.getOrBuildModel();

    const results = elementIds.map((eid) => {
      const node = deps.modelService.findNode(model, eid);
      if (!node) {
        return { success: false, elementId: eid, error: { code: 404, message: 'Not found' } };
      }

      // Collect children as "HasComponent" relationships
      const childIds = model.childrenById.get(node.id) ?? [];
      const relatedObjects = childIds
        .map((cId) => model.nodesById.get(cId))
        .filter(Boolean)
        .map((child) => ({
          sourceRelationship: 'HasComponent',
          object: {
            elementId: child!.id,
            displayName: child!.name,
            typeElementId: child!.type ?? '',
            parentId: node.id,
            isComposition: child!.children.length > 0,
          },
        }));

      // Also include parent as reverse relationship
      const parentId = deps.modelService.parentIdOf(model, node.id);
      if (parentId) {
        const parent = model.nodesById.get(parentId);
        if (parent) {
          relatedObjects.push({
            sourceRelationship: 'IsComponentOf',
            object: {
              elementId: parent.id,
              displayName: parent.name,
              typeElementId: parent.type ?? '',
              parentId: deps.modelService.parentIdOf(model, parent.id),
              isComposition: parent.children.length > 0,
            },
          });
        }
      }

      return { success: true, elementId: eid, result: relatedObjects };
    });

    return { success: true, results };
  });

  // ── POST /v1/objects/value ─────────────────────────────────
  app.post('/v1/objects/value', async (req: FastifyRequest<{ Body: { elementIds: string[]; maxDepth?: number } }>) => {
    const { elementIds, maxDepth } = req.body;
    const results = await deps.valueService.readValues(elementIds, maxDepth ?? 1);
    return { success: true, results };
  });

  // ── POST /v1/objects/history ───────────────────────────────
  app.post('/v1/objects/history', async (req: FastifyRequest<{ Body: { elementIds: string[]; startTime?: string; endTime?: string } }>) => {
    const { elementIds, startTime, endTime } = req.body;
    const results = await deps.historyService.readHistory(
      elementIds,
      startTime ? new Date(startTime) : null,
      endTime ? new Date(endTime) : null,
    );
    return { success: true, results };
  });

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
  app.put('/v1/objects/:elementId/value', async (req: FastifyRequest<{ Params: { elementId: string }; Body: { value: unknown } }>) => {
    const { elementId } = req.params;
    const { value } = req.body;
    try {
      await deps.valueService.writeValue(elementId, value);
      return { success: true, result: null };
    } catch (err) {
      throw i3xError(404, 404, (err as Error).message);
    }
  });
}
