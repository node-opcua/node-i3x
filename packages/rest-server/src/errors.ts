// ─────────────────────────────────────────────────────────────
// @node-i3x/rest-server — HTTP error helpers
// ─────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RestServerDeps } from './app.js';

export interface I3xError extends Error {
  statusCode: number;
}

export function i3xError(statusCode: number, message: string): I3xError {
  const err = new Error(message) as I3xError;
  err.statusCode = statusCode;
  return err;
}

/**
 * Rethrow an unknown error as an I3xError.
 * Replaces 5+ identical catch blocks across routes.
 */
export function rethrowAsI3x(err: unknown): never {
  const e = err as Error & { statusCode?: number };
  throw i3xError(e.statusCode ?? 500, e.message);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (
      error: Error & { statusCode?: number },
      _req: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const statusCode = error.statusCode ?? 500;
      const title =
        statusCode === 400
          ? 'Bad Request'
          : statusCode === 404
            ? 'Not Found'
            : statusCode === 501
              ? 'Not Implemented'
              : 'Internal Server Error';
      reply.status(statusCode).send({
        success: false,
        responseDetail: { title, status: statusCode, detail: error.message },
      });
    },
  );
}
