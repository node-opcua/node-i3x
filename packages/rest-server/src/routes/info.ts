import type { FastifyInstance } from 'fastify';

export default async function infoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/info', async () => ({
    success: true,
    result: {
      specVersion: '1.0',
      serverVersion: '0.1.0',
      serverName: 'node-i3x',
      vendor: {
        name: 'Sterfive SAS',
        url: 'https://sterfive.com',
        support: 'contact@sterfive.com',
      },
      license: 'AGPL-3.0-or-later OR LicenseRef-Sterfive-Commercial',
      capabilities: {
        query: { history: true },
        update: { current: true, history: false },
        subscribe: { stream: true },
      },
    },
  }));
}
