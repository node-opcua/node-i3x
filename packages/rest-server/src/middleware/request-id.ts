// ─────────────────────────────────────────────────────────────
// @i3x/rest-server — Request ID middleware
// ─────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    const id = (req.headers['x-request-id'] as string) ?? randomUUID();
    reply.header('x-request-id', id);
  });
}

export default fp(requestIdPlugin, { name: 'request-id' });
