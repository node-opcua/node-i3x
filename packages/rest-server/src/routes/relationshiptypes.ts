import type { FastifyInstance } from 'fastify';

export default async function relationshiptypeRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get('/v1/relationshiptypes', async (_req, reply) => {
    reply.status(501);
    return { success: false, error: { code: 501, message: 'Not implemented' } };
  });

  app.post('/v1/relationshiptypes/query', async (_req, reply) => {
    reply.status(501);
    return { success: false, error: { code: 501, message: 'Not implemented' } };
  });
}
