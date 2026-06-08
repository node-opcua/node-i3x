import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDeps, rethrowAsI3x } from '../errors.js';

export default async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  const deps = getDeps(app);

  // ── POST /v1/subscriptions ─────────────────────────────────
  app.post('/v1/subscriptions', async (req: FastifyRequest<{ Body: { clientId?: string; displayName?: string } }>) => {
    const result = deps.subscriptionService.create({
      clientId: req.body.clientId,
      displayName: req.body.displayName,
    });
    return { success: true, result };
  });

  // ── POST /v1/subscriptions/register ────────────────────────
  app.post('/v1/subscriptions/register', async (req: FastifyRequest<{ Body: { subscriptionId: string; elementIds: string[]; maxDepth?: number } }>) => {
    const { subscriptionId, elementIds, maxDepth } = req.body;
    try {
      const { registered, errors } = await deps.subscriptionService.register(
        subscriptionId, elementIds, maxDepth ?? 1,
      );
      const results = [
        ...registered.map((eid) => ({ success: true, elementId: eid, result: null })),
        ...errors.map((e) => ({
          success: false, elementId: e.elementId,
          error: { code: 404, message: e.error },
        })),
      ];
      return { success: true, results };
    } catch (err) {
      rethrowAsI3x(err);
    }
  });

  // ── POST /v1/subscriptions/unregister ──────────────────────
  app.post('/v1/subscriptions/unregister', async (req: FastifyRequest<{ Body: { subscriptionId: string; elementIds: string[] } }>) => {
    const { subscriptionId, elementIds } = req.body;
    try {
      await deps.subscriptionService.unregister(subscriptionId, elementIds);
      return { success: true, result: null };
    } catch (err) {
      rethrowAsI3x(err);
    }
  });

  // ── POST /v1/subscriptions/sync ────────────────────────────
  app.post('/v1/subscriptions/sync', async (req: FastifyRequest<{ Body: { subscriptionId: string; acknowledgeSequence?: number; lastSequenceNumber?: number } }>) => {
    const { subscriptionId, acknowledgeSequence, lastSequenceNumber } = req.body;
    const ackSeq = acknowledgeSequence ?? lastSequenceNumber ?? 0;
    try {
      const updates = deps.subscriptionService.sync(subscriptionId, ackSeq);
      return { success: true, result: updates };
    } catch (err) {
      rethrowAsI3x(err);
    }
  });

  // ── POST /v1/subscriptions/stream ──────────────────────────
  // True Server-Sent Events (SSE) stream, matching the Python
  // reference: the connection stays open and we loop, yielding
  // batches of updates as they arrive.  Keepalive comments are
  // sent on timeout so the connection doesn't drop.
  app.post('/v1/subscriptions/stream', async (req: FastifyRequest<{ Body: { subscriptionId: string; acknowledgeSequence?: number; lastSequenceNumber?: number } }>, reply) => {
    const { subscriptionId, acknowledgeSequence, lastSequenceNumber } = req.body;
    const ackSeq = acknowledgeSequence ?? lastSequenceNumber ?? 0;

    try {
      // Acknowledge (trim) previously delivered updates,
      // matching the Python sync() call at the top of stream.
      deps.subscriptionService.acknowledge(subscriptionId, ackSeq);

      // Tell Fastify we're taking over the raw response —
      // without this, Fastify finalizes the response immediately.
      await reply.hijack();

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      let lastSequence = ackSeq;
      let closed = false;

      req.raw.on('close', () => { closed = true; });

      while (!closed) {
        const updates = await deps.subscriptionService.waitForUpdates(
          subscriptionId, lastSequence, 15_000,
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
          nodeId: u.nodeId,
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
  });

  // ── POST /v1/subscriptions/delete ──────────────────────────
  app.post('/v1/subscriptions/delete', async (req: FastifyRequest<{ Body: { subscriptionIds: string[] } }>) => {
    const results = await deps.subscriptionService.deleteSubscriptions(req.body.subscriptionIds);
    return { success: true, results };
  });

  // ── POST /v1/subscriptions/list ────────────────────────────
  app.post('/v1/subscriptions/list', async (req: FastifyRequest<{ Body: { subscriptionIds: string[] } }>) => {
    const details = deps.subscriptionService.list(req.body.subscriptionIds);
    const results = details.map((d) => ({
      success: true, subscriptionId: d.subscriptionId, result: d,
    }));
    return { success: true, results };
  });
}
