import type { RestServerDeps } from '@node-i3x/rest-server';
import { RestClientBinding } from './rest-binding.js';

type InjectableApp = Awaited<
  ReturnType<typeof import('@node-i3x/rest-server').createApp>
>;

/**
 * Binding to an i3X stack running in this process.
 *
 * Requests go through the real rest-server routes (Fastify `inject()`, no socket),
 * so in-process answers are exactly what a remote node-i3x server would send:
 * same parentId, roots, related objects, values and server info.
 */
export class InProcessConnectorBinding extends RestClientBinding {
  constructor(deps: RestServerDeps) {
    super('http://in-process', undefined, 15_000, injectFetch(deps));
  }
}

/** A fetch that answers from an in-process rest-server instead of the network. */
export function injectFetch(deps: RestServerDeps): typeof fetch {
  let app: Promise<InjectableApp> | undefined;
  return async (input, init) => {
    // Loaded lazily so the REST-only CLI never pulls in Fastify. No request logging:
    // Fastify logs to stdout, which is the MCP stdio channel.
    app ??= import('@node-i3x/rest-server').then(({ createApp }) =>
      createApp({ ...deps, requireAuth: false }, { logger: false }),
    );
    const url = new URL(String(input));
    const res = await (await app).inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST',
      url: `${url.pathname}${url.search}`,
      headers: init?.headers as Record<string, string> | undefined,
      payload: typeof init?.body === 'string' ? init.body : undefined,
    });
    return new Response(res.body, {
      status: res.statusCode,
      headers: {
        'content-type': String(res.headers['content-type'] ?? 'application/json'),
      },
    });
  };
}
