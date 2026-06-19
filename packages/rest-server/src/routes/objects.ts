import type { ModelNode, ObjectType } from '@node-i3x/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDeps } from '../app.js';
import { i3xError } from '../errors.js';
import {
  bulkError,
  bulkResponse,
  bulkSuccess,
  successResponse,
  toObjectInstance,
} from '../helpers/response.js';

export default async function objectRoutes(app: FastifyInstance): Promise<void> {
  const deps = getDeps(app);

  const readOnlyGuard = async (_req: FastifyRequest, reply: FastifyReply) => {
    if (deps.readOnly) {
      reply.status(501);
      return reply.send({
        success: false,
        responseDetail: {
          title: 'Not Implemented',
          status: 501,
          detail: 'Write operations are disabled (read-only mode)',
        },
      });
    }
  };

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
      const { typeElementId, root, includeMetadata } = req.query;
      const incMeta = includeMetadata === true || includeMetadata === 'true';

      let nodes: ModelNode[];

      if (root) {
        nodes = model.rootIds
          .map((id) => model.nodesById.get(id))
          .filter((n): n is ModelNode => n !== undefined && n.kind === 'asset');
      } else {
        nodes = Array.from(model.nodesById.values()).filter(
          (n): n is ModelNode => n.kind === 'asset' || n.kind === 'property',
        );
      }

      if (typeElementId) {
        nodes = nodes.filter((n) => n.type === typeElementId);
      }

      let typeMap: Map<string, ObjectType> | undefined;
      if (incMeta) {
        const types = await deps.typeService.getObjectTypes();
        typeMap = new Map(types.map((t) => [t.elementId, t]));
      }

      const result = nodes.map((node) =>
        toObjectInstance(
          node,
          deps.modelService.parentIdOf(model, node.id),
          incMeta,
          typeMap,
        ),
      );
      return successResponse(result);
    },
  );

  // ── POST /v1/objects/list ──────────────────────────────────
  app.post(
    '/v1/objects/list',
    {
      schema: {
        body: {
          type: 'object',
          required: ['elementIds'],
          properties: {
            elementIds: { type: 'array', items: { type: 'string' } },
            includeMetadata: { type: 'boolean' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: { elementIds: string[]; includeMetadata?: boolean };
      }>,
    ) => {
      const { elementIds, includeMetadata } = req.body;
      const incMeta = includeMetadata === true;
      const model = await deps.modelService.getOrBuildModel();
      let typeMap: Map<string, ObjectType> | undefined;
      if (incMeta) {
        const types = await deps.typeService.getObjectTypes();
        typeMap = new Map(types.map((t) => [t.elementId, t]));
      }

      const results = elementIds.map((id) => {
        const node = deps.modelService.findNode(model, id);
        if (!node) return bulkError(id, 404, 'Not found');
        return bulkSuccess(
          id,
          toObjectInstance(
            node,
            deps.modelService.parentIdOf(model, node.id),
            incMeta,
            typeMap,
          ),
        );
      });
      return bulkResponse(results);
    },
  );

  // ── POST /v1/objects/related ───────────────────────────────
  // Spec: { elementIds: [...] } → BulkResponse<List<RelatedObjectResult>>
  app.post(
    '/v1/objects/related',
    {
      schema: {
        body: {
          type: 'object',
          required: ['elementIds'],
          properties: {
            elementIds: { type: 'array', items: { type: 'string' } },
            relationshipType: { type: ['string', 'null'] },
            includeMetadata: { type: 'boolean' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: {
          elementIds: string[];
          relationshipType?: string | null;
          includeMetadata?: boolean;
        };
      }>,
    ) => {
      const { elementIds, includeMetadata } = req.body;
      const incMeta = includeMetadata === true;
      const model = await deps.modelService.getOrBuildModel();

      let typeMap: Map<string, ObjectType> | undefined;
      if (incMeta) {
        const types = await deps.typeService.getObjectTypes();
        typeMap = new Map(types.map((t) => [t.elementId, t]));
      }

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
            object: toObjectInstance(child!, node.id, incMeta, typeMap),
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
                incMeta,
                typeMap,
              ),
            });
          }
        }

        return bulkSuccess(eid, relatedObjects);
      });

      return bulkResponse(results);
    },
  );

  // ── POST /v1/objects/value ─────────────────────────────────
  app.post(
    '/v1/objects/value',
    {
      schema: {
        body: {
          type: 'object',
          required: ['elementIds'],
          properties: {
            elementIds: { type: 'array', items: { type: 'string' } },
            maxDepth: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{ Body: { elementIds: string[]; maxDepth?: number } }>,
    ) => {
      const { elementIds, maxDepth } = req.body;
      const results = await deps.valueService.readValues(elementIds, maxDepth ?? 1);
      return bulkResponse(results);
    },
  );

  // ── POST /v1/objects/history ───────────────────────────────
  app.post(
    '/v1/objects/history',
    {
      schema: {
        body: {
          type: 'object',
          required: ['elementIds', 'startTime', 'endTime'],
          properties: {
            elementIds: { type: 'array', items: { type: 'string' } },
            startTime: { type: 'string', format: 'date-time' },
            endTime: { type: 'string', format: 'date-time' },
            maxDepth: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
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
      const { elementIds, startTime, endTime, maxDepth } = req.body;

      if (!startTime || !endTime) {
        throw i3xError(400, 'Both startTime and endTime are required.');
      }

      // RFC 3339 / ISO 8601 validation regex
      const rfc3339Regex =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
      if (!rfc3339Regex.test(startTime) || !rfc3339Regex.test(endTime)) {
        throw i3xError(400, 'startTime and endTime must be in RFC 3339 format.');
      }

      const results = await deps.historyService.readHistory(
        elementIds,
        new Date(startTime),
        new Date(endTime),
        maxDepth ?? 1,
      );
      return bulkResponse(results);
    },
  );

  // ── PUT /v1/objects/history ────────────────────────────────
  app.put('/v1/objects/history', { preHandler: readOnlyGuard }, async (_req, reply) => {
    reply.status(501);
    return {
      success: false,
      responseDetail: {
        title: 'Not Implemented',
        status: 501,
        detail: 'Not implemented',
      },
    };
  });

  if (deps.experimental) {
    // ── GET /v1/objects/:elementId/history ─────────────────────
    app.get('/v1/objects/:elementId/history', async (_req, reply) => {
      reply.status(501);
      return {
        success: false,
        responseDetail: {
          title: 'Not Implemented',
          status: 501,
          detail: 'Not implemented',
        },
      };
    });

    // ── PUT /v1/objects/:elementId/history ─────────────────────
    app.put(
      '/v1/objects/:elementId/history',
      { preHandler: readOnlyGuard },
      async (_req, reply) => {
        reply.status(501);
        return {
          success: false,
          responseDetail: {
            title: 'Not Implemented',
            status: 501,
            detail: 'Not implemented',
          },
        };
      },
    );

    // ── PUT /v1/objects/:elementId/value ───────────────────────
    app.put(
      '/v1/objects/:elementId/value',
      { preHandler: readOnlyGuard },
      async (
        req: FastifyRequest<{ Params: { elementId: string }; Body: { value: unknown } }>,
      ) => {
        const { elementId } = req.params;
        const { value } = req.body;
        try {
          await deps.valueService.writeValue(elementId, value);
          return successResponse(null);
        } catch (err) {
          throw i3xError(404, (err as Error).message);
        }
      },
    );
  }

  // ── PUT /v1/objects/value ──────────────────────────────────
  app.put(
    '/v1/objects/value',
    { preHandler: readOnlyGuard },
    async (
      req: FastifyRequest<{
        Body: { elementId: string; value: unknown }[] | Record<string, unknown>;
      }>,
    ) => {
      const body = req.body;
      let items: { elementId: string; value: unknown }[] = [];
      if (Array.isArray(body)) {
        items = body;
      } else if (body && typeof body === 'object') {
        // Spec format: { updates: [{ elementId, value }] }
        const maybeUpdates = (body as Record<string, unknown>).updates;
        if (Array.isArray(maybeUpdates)) {
          items = maybeUpdates as { elementId: string; value: unknown }[];
        } else {
          // Legacy object-as-map format: { elementId: value, ... }
          items = Object.entries(body).map(([elementId, value]) => ({
            elementId,
            value,
          }));
        }
      }

      const results = await Promise.all(
        items.map(async ({ elementId, value }) => {
          try {
            await deps.valueService.writeValue(elementId, value);
            return bulkSuccess(elementId, null);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : String(err) || 'Write failed';
            // Distinguish "not found" from "not writable / write error"
            const isNotFound = message.includes('not found');
            const code = isNotFound ? 404 : 403;
            return bulkError(elementId, code, message);
          }
        }),
      );

      return bulkResponse(results);
    },
  );
}
