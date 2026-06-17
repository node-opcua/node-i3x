// ─────────────────────────────────────────────────────────────
// Bearer token authentication middleware for Fastify
// ─────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';

/** Public routes that MUST NOT require auth (CORE-02). */
const PUBLIC_PATHS = new Set(['/v1/info', '/health', '/ready']);

/**
 * Register a Bearer-token auth hook on the Fastify instance.
 *
 * When `apiKey` is provided, every request (except public paths
 * and the /v1/docs Swagger UI) must include a valid
 * `Authorization: Bearer <key>` header. Requests without a
 * valid token receive a 401 response with an i3X error envelope.
 *
 * When `apiKey` is undefined/empty, the hook is a no-op and the
 * server runs in open mode (no auth required).
 */
export function registerAuth(app: FastifyInstance, apiKey: string | undefined): void {
  if (!apiKey) return; // open mode — no auth

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!;

    // Allow public endpoints
    if (PUBLIC_PATHS.has(path)) return;

    // Allow Swagger / OpenAPI docs
    if (
      path.startsWith('/v1/docs') ||
      path.startsWith('/docs') ||
      path.endsWith('/openapi.json')
    )
      return;

    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.status(401).send({
        success: false,
        responseDetail: {
          title: 'Unauthorized',
          status: 401,
          detail: 'Missing or invalid Bearer token.',
        },
      });
      return reply;
    }

    const [scheme, token] = authHeader.split(' ', 2);
    if (scheme?.toLowerCase() !== 'bearer' || token !== apiKey) {
      reply.status(401).send({
        success: false,
        responseDetail: {
          title: 'Unauthorized',
          status: 401,
          detail: 'Missing or invalid Bearer token.',
        },
      });
      return reply;
    }
  });
}
