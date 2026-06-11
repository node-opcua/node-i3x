import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDeps, i3xError, rethrowAsI3x } from '../errors.js';
import { bulkResponse } from '../helpers/response.js';

export default async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  const deps = getDeps(app);

  // ── POST /v1/subscriptions ─────────────────────────────────
  app.post(
    '/v1/subscriptions',
    async (
      req: FastifyRequest<{ Body: { clientId?: string; displayName?: string } }>,
    ) => {
      const { clientId, displayName } = req.body;
      if (!clientId) {
        throw i3xError(400, 400, 'clientId is required');
      }
      const result = deps.subscriptionService.create({
        clientId,
        displayName,
      });
      return { success: true, result };
    },
  );

  // ── POST /v1/subscriptions/register ────────────────────────
  app.post(
    '/v1/subscriptions/register',
    async (
      req: FastifyRequest<{
        Body: {
          subscriptionId: string;
          elementIds: string[];
          maxDepth?: number;
          clientId?: string;
        };
      }>,
    ) => {
      const { subscriptionId, elementIds, maxDepth, clientId } = req.body;
      if (!clientId) {
        throw i3xError(400, 400, 'clientId is required');
      }
      const details = deps.subscriptionService.list([subscriptionId]);
      if (details.length === 0 || details[0]!.clientId !== clientId) {
        throw i3xError(404, 404, `Subscription ${subscriptionId} not found`);
      }
      try {
        const { registered, errors } = await deps.subscriptionService.register(
          subscriptionId,
          elementIds,
          maxDepth ?? 1,
        );
        const results = [
          ...registered.map((eid) => ({ success: true, elementId: eid, result: null })),
          ...errors.map((e) => ({
            success: false,
            elementId: e.elementId,
            error: { code: 404, message: e.error },
            responseDetail: { title: 'Not Found', status: 404, detail: e.error },
          })),
        ];
        return bulkResponse(results);
      } catch (err) {
        rethrowAsI3x(err);
      }
    },
  );

  // ── POST /v1/subscriptions/unregister ──────────────────────
  app.post(
    '/v1/subscriptions/unregister',
    async (
      req: FastifyRequest<{
        Body: { subscriptionId: string; elementIds: string[]; clientId?: string };
      }>,
    ) => {
      const { subscriptionId, elementIds, clientId } = req.body;
      if (!clientId) {
        throw i3xError(400, 400, 'clientId is required');
      }
      const details = deps.subscriptionService.list([subscriptionId]);
      if (details.length === 0 || details[0]!.clientId !== clientId) {
        throw i3xError(404, 404, `Subscription ${subscriptionId} not found`);
      }
      try {
        await deps.subscriptionService.unregister(subscriptionId, elementIds);
        const results = elementIds.map((eid) => ({
          success: true,
          elementId: eid,
          result: null,
        }));
        return bulkResponse(results);
      } catch (err) {
        rethrowAsI3x(err);
      }
    },
  );

  // ── POST /v1/subscriptions/sync ────────────────────────────
  app.post(
    '/v1/subscriptions/sync',
    async (
      req: FastifyRequest<{
        Body: {
          subscriptionId: string;
          acknowledgeSequence?: number;
          lastSequenceNumber?: number;
          clientId?: string;
        };
      }>,
    ) => {
      const { subscriptionId, acknowledgeSequence, lastSequenceNumber, clientId } =
        req.body;
      if (!clientId) {
        throw i3xError(400, 400, 'clientId is required');
      }
      const details = deps.subscriptionService.list([subscriptionId]);
      if (details.length === 0 || details[0]!.clientId !== clientId) {
        throw i3xError(404, 404, `Subscription ${subscriptionId} not found`);
      }
      const ackSeq = acknowledgeSequence ?? lastSequenceNumber ?? 0;
      try {
        const updates = deps.subscriptionService.sync(subscriptionId, ackSeq);
        return { success: true, result: updates };
      } catch (err) {
        rethrowAsI3x(err);
      }
    },
  );

  // ── POST /v1/subscriptions/stream ──────────────────────────
  app.post(
    '/v1/subscriptions/stream',
    async (
      req: FastifyRequest<{
        Body: {
          subscriptionId: string;
          acknowledgeSequence?: number;
          lastSequenceNumber?: number;
          clientId?: string;
        };
      }>,
      reply,
    ) => {
      const { subscriptionId, acknowledgeSequence, lastSequenceNumber, clientId } =
        req.body;
      if (!clientId) {
        throw i3xError(400, 400, 'clientId is required');
      }
      const details = deps.subscriptionService.list([subscriptionId]);
      if (details.length === 0 || details[0]!.clientId !== clientId) {
        throw i3xError(404, 404, `Subscription ${subscriptionId} not found`);
      }
      const ackSeq = acknowledgeSequence ?? lastSequenceNumber ?? 0;

      try {
        // Validate subscription exists BEFORE hijacking the response
        deps.subscriptionService.acknowledge(subscriptionId, ackSeq);

        // Tell Fastify we're taking over the raw response —
        // without this, Fastify finalizes the response immediately.
        await reply.hijack();

        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // Flush headers immediately with an initial keepalive comment
        // so the client (and any proxy like ngrok) sees the connection
        // is established and doesn't time out waiting.
        reply.raw.write(': keepalive\n\n');

        let lastSequence = ackSeq;
        let closed = false;

        const closeStream = () => {
          closed = true;
        };

        req.raw.on('close', () => {
          closed = true;
          deps.subscriptionService.clearActiveStream(subscriptionId, closeStream);
        });

        // Register this stream — closes any previously active stream
        // for this subscription (single-stream enforcement per spec).
        deps.subscriptionService.registerActiveStream(subscriptionId, closeStream);

        while (!closed) {
          const updates = await deps.subscriptionService.waitForUpdates(
            subscriptionId,
            lastSequence,
            15_000,
          );

          if (closed) break;

          if (!updates || updates.length === 0) {
            // Keepalive — prevent connection timeout
            reply.raw.write(': keepalive\n\n');
            continue;
          }

          lastSequence = updates[updates.length - 1]!.sequenceNumber;
          deps.subscriptionService.acknowledge(subscriptionId, lastSequence);

          const payload = updates.map((u) => ({
            sequenceNumber: u.sequenceNumber,
            elementId: u.elementId,
            value: u.value,
            quality: u.quality,
            timestamp: u.timestamp,
          }));
          reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        }

        reply.raw.end();
      } catch (err) {
        if (!reply.raw.headersSent) {
          rethrowAsI3x(err);
        }
      }
    },
  );

  // ── POST /v1/subscriptions/delete ──────────────────────────
  app.post(
    '/v1/subscriptions/delete',
    async (
      req: FastifyRequest<{ Body: { subscriptionIds: string[]; clientId?: string } }>,
    ) => {
      const { subscriptionIds, clientId } = req.body;
      if (!clientId) {
        throw i3xError(400, 400, 'clientId is required');
      }
      const details = deps.subscriptionService.list(subscriptionIds);
      for (const id of subscriptionIds) {
        const d = details.find((x) => x.subscriptionId === id);
        if (!d || d.clientId !== clientId) {
          throw i3xError(404, 404, `Subscription ${id} not found`);
        }
      }
      const results = await deps.subscriptionService.deleteSubscriptions(subscriptionIds);
      return bulkResponse(results);
    },
  );

  // ── POST /v1/subscriptions/list ────────────────────────────
  app.post(
    '/v1/subscriptions/list',
    async (
      req: FastifyRequest<{ Body: { subscriptionIds?: string[]; clientId?: string } }>,
    ) => {
      const { subscriptionIds, clientId } = req.body;
      if (!clientId) {
        throw i3xError(400, 400, 'clientId is required');
      }
      const details = deps.subscriptionService.list(subscriptionIds);

      let results: any[];
      if (subscriptionIds && subscriptionIds.length > 0) {
        results = subscriptionIds.map((id) => {
          const d = details.find((x) => x.subscriptionId === id);
          if (!d || d.clientId !== clientId) {
            return {
              success: false,
              subscriptionId: id,
              error: { code: 404, message: `Subscription ${id} not found` },
              responseDetail: {
                title: 'Not Found',
                status: 404,
                detail: `Subscription ${id} not found`,
              },
            };
          }
          return {
            success: true,
            subscriptionId: id,
            result: d,
          };
        });
      } else {
        const filtered = details.filter((d) => d.clientId === clientId);
        results = filtered.map((d) => ({
          success: true,
          subscriptionId: d.subscriptionId,
          result: d,
        }));
      }

      return bulkResponse(results);
    },
  );
}
