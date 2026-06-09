// ─────────────────────────────────────────────────────────────
// @node-i3x/rest-server — HTTP error helpers
// ─────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RestServerDeps } from './app.js';

export interface I3xError extends Error {
  statusCode: number;
  code: number;
}

export function i3xError(
  statusCode: number,
  code: number,
  message: string,
): I3xError {
  const err = new Error(message) as I3xError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/**
 * Rethrow an unknown error as an I3xError.
 * Replaces 5+ identical catch blocks across routes.
 */
export function rethrowAsI3x(err: unknown): never {
  const e = err as Error & { statusCode?: number };
  throw i3xError(
    e.statusCode ?? 500,
    e.statusCode ?? 500,
    e.message,
  );
}

/** Extract typed deps from the Fastify app instance. */
export function getDeps(app: FastifyInstance): RestServerDeps {
  return app.deps;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: Error & { statusCode?: number; code?: number | string }, _req: FastifyRequest, reply: FastifyReply) => {
      const statusCode = error.statusCode ?? 500;
      const code = typeof error.code === 'number' ? error.code : statusCode;
      reply.status(statusCode).send({
        success: false,
        error: { code, message: error.message },
      });
    },
  );
}
