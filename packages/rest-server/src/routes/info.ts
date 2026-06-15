import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';

let serverVersion = '0.6.0';
try {
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  serverVersion = pkg.version;
} catch {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    serverVersion = pkg.version;
  } catch {
    // fallback
  }
}

export default async function infoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/info', async () => {
    const readOnly = app.deps.readOnly ?? false;
    return {
      success: true,
      result: {
        specVersion: '1.0',
        serverVersion,
        serverName: 'node-i3x',
        vendor: {
          name: 'Sterfive SAS',
          url: 'https://sterfive.com',
          support: 'contact@sterfive.com',
        },
        license: 'AGPL-3.0-or-later OR LicenseRef-Sterfive-Commercial',
        capabilities: {
          query: { history: !readOnly },
          update: { current: !readOnly, history: false },
          subscribe: { stream: true },
        },
      },
    };
  });
}
