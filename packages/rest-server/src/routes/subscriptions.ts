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
  app.post('/v1/subscriptions/stream', async (req: FastifyRequest<{ Body: { subscriptionId: string; acknowledgeSequence?: number; lastSequenceNumber?: number } }>, reply) => {
    const { subscriptionId, acknowledgeSequence, lastSequenceNumber } = req.body;
    const ackSeq = acknowledgeSequence ?? lastSequenceNumber ?? 0;

    try {
      const updates = await deps.subscriptionService.waitForUpdates(
        subscriptionId, ackSeq, 30_000,
      );

      reply.header('content-type', 'text/event-stream');
      reply.header('cache-control', 'no-cache');
      reply.header('connection', 'keep-alive');

      const lines: string[] = [];
      for (const update of updates) {
        lines.push(`data: ${JSON.stringify(update)}\n\n`);
      }
      lines.push('event: done\ndata: {}\n\n');
      return reply.send(lines.join(''));
    } catch (err) {
      rethrowAsI3x(err);
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
