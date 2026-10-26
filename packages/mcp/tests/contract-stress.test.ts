// Contract tests for the stress-test findings: explore fan-out, connect token check,
// output size, suggestion cost and history errors, against the real rest-server
// routes in-process through inject() (no port).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createApp } from '@node-i3x/rest-server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RestClientBinding } from '../src/bindings/rest-binding.js';
import { InProcessConnectorBinding, injectFetch } from '../src/in-process.js';
import { NodeI3xMcpServer } from '../src/server.js';
import { handleConnect } from '../src/tools/connect.js';
import { handleExploreHierarchy } from '../src/tools/explore-hierarchy.js';
import {
  handleQueryTelemetry,
  queryTelemetrySchema,
} from '../src/tools/query-telemetry.js';
import { rankObjectSuggestions } from '../src/utils/similarity.js';
import { makeDeps } from './helpers/contract-fixture.js';

type Injectable = Awaited<ReturnType<typeof createApp>>;

/** fetch into an app, forwarding headers (unlike injectFetch, auth stays on). */
function appFetch(app: Injectable): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST',
      url: `${url.pathname}${url.search}`,
      headers: init?.headers as Record<string, string> | undefined,
      payload: typeof init?.body === 'string' ? init.body : undefined,
    });
    return new Response(res.body, { status: res.statusCode });
  };
}

async function idsByName(binding: RestClientBinding) {
  const all = await binding.getObjects();
  return Object.fromEntries(all.map((o) => [o.displayName, o.elementId]));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('explore fan-out', () => {
  it('walks level by level with one bulk /objects/related call per level', async () => {
    const inject = injectFetch(makeDeps());
    const relatedBodies: Array<{ elementIds: string[] }> = [];
    const counting: typeof fetch = (input, init) => {
      if (String(input).endsWith('/v1/objects/related')) {
        relatedBodies.push(JSON.parse(String(init?.body)));
      }
      return inject(input, init);
    };
    const binding = new RestClientBinding(
      'http://i3x.example',
      undefined,
      15_000,
      counting,
    );

    // maxDepth 0 = unlimited, as in the value tools (it used to become 2).
    const res = await handleExploreHierarchy(binding, { maxDepth: 0, maxNodes: 500 });
    const machine = res.plantTopology?.[0];
    const motor = machine?.children?.find((c) => c.displayName === 'Motor');
    expect(motor?.children?.map((c) => c.displayName)).toEqual(['Speed']);

    // Machine | Temperature, Reset, Motor | Speed: 3 levels, 3 requests (not 5).
    expect(relatedBodies.map((b) => b.elementIds.length)).toEqual([1, 3, 1]);
    expect(res).toMatchObject({ traversalDepth: 'unlimited', nodeCount: 5 });
  });

  it('records a failed node on the node and keeps walking the rest', async () => {
    const deps = makeDeps();
    const ids = await idsByName(new InProcessConnectorBinding(deps));
    const inject = injectFetch(deps);
    // The server fails Motor's item only, as a per-item bulk error.
    const failingMotor: typeof fetch = async (input, init) => {
      const res = await inject(input, init);
      if (!String(input).endsWith('/v1/objects/related')) return res;
      const body = await res.json();
      body.results = body.results.map((r: { elementId: string }) =>
        r.elementId === ids.Motor
          ? {
              success: false,
              elementId: r.elementId,
              responseDetail: { title: 'Error', status: 500, detail: 'boom' },
            }
          : r,
      );
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const binding = new RestClientBinding(
      'http://i3x.example',
      undefined,
      15_000,
      failingMotor,
    );

    const res = await handleExploreHierarchy(binding, { maxDepth: 0, maxNodes: 500 });
    const children = res.plantTopology?.[0]?.children ?? [];
    expect(children.map((c) => c.displayName)).toEqual(['Temperature', 'Reset', 'Motor']);
    expect(children.find((c) => c.displayName === 'Motor')).toMatchObject({
      error: '500 Error boom',
    });
  });

  it('stops at the node budget and says so', async () => {
    const binding = new InProcessConnectorBinding(makeDeps());
    const res = await handleExploreHierarchy(binding, { maxDepth: 0, maxNodes: 3 });
    expect(res.plantTopology?.[0]).toMatchObject({
      displayName: 'Machine',
      truncated: true,
    });
    expect(res.truncated).toMatchObject({ maxNodes: 3 });
    expect(res.nodeCount).toBe(1);
  });
});

describe('i3x_connect credential check', () => {
  async function securedServer() {
    const app = await createApp(makeDeps({ apiKey: 'secret', requireAuth: true }), {
      logger: false,
    });
    vi.stubGlobal('fetch', appFetch(app));
  }

  it('reports auth_failed for a wrong token and keeps the previous connection', async () => {
    await securedServer();
    const onSwitch = vi.fn();
    const res = await handleConnect(
      { serverUrl: 'http://i3x.example', authToken: 'wrong', verifyConnection: true },
      onSwitch,
    );
    expect(res).toMatchObject({ status: 'auth_failed' });
    expect(onSwitch).not.toHaveBeenCalled();

    const ok = await handleConnect(
      { serverUrl: 'http://i3x.example', authToken: 'secret', verifyConnection: true },
      onSwitch,
    );
    expect(ok).toMatchObject({ status: 'connected', authenticated: true });
  });

  it('keeps the current token when re-connecting to the same URL without one', async () => {
    await securedServer();
    const current = new RestClientBinding('http://i3x.example/v1', 'secret');
    const res = await handleConnect(
      { serverUrl: 'http://i3x.example', verifyConnection: true },
      () => {},
      current,
    );
    expect(res).toMatchObject({ status: 'connected', authenticated: true });
    expect(res).toHaveProperty('note');
  });
});

describe('output size', () => {
  it('deduplicates elementIds and bounds their count', async () => {
    const binding = new InProcessConnectorBinding(makeDeps());
    const { Motor } = await idsByName(binding);
    const args = queryTelemetrySchema.parse({
      elementIds: Array.from({ length: 200 }, () => Motor),
      mode: 'current',
    });
    expect(args.elementIds).toEqual([Motor]);
    const res = await handleQueryTelemetry(binding, args);
    expect(res.telemetry).toHaveLength(1);

    expect(() =>
      queryTelemetrySchema.parse({
        elementIds: Array.from({ length: 101 }, (_, i) => `id-${i}`),
      }),
    ).toThrow(/At most 100 distinct elementIds/);
  });

  it('caps a tool result with a notice saying how to narrow the query', async () => {
    const server = new NodeI3xMcpServer(new InProcessConnectorBinding(makeDeps()), {
      maxResultChars: 300,
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    // The server object is private: connect it to the in-memory transport for the test.
    await (
      server as unknown as { server: { connect(t: unknown): Promise<void> } }
    ).server.connect(serverSide);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientSide);

    const res = await client.callTool({
      name: 'i3x_explore_plant_hierarchy',
      arguments: { maxDepth: 0 },
    });
    const text = (res.content as Array<{ text: string }>)[0]!.text;
    expect(text.length).toBeLessThan(600);
    expect(text).toMatch(/\[Result truncated: showing the first 300 of \d+ characters/);
    expect(text).toMatch(/pass rootElementId/);
    await client.close();
  });
});

describe('suggestion cost', () => {
  it('does not run fuzzy matching for an over-long query', () => {
    const objects = Array.from({ length: 3000 }, (_, i) => ({
      elementId: `instance-${i.toString(16).padStart(16, '0')}`,
      displayName: `Asset number ${i} of the plant`,
    }));
    const started = performance.now();
    expect(rankObjectSuggestions('x'.repeat(5000), objects)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(500);

    // Normal queries still match by name.
    expect(rankObjectSuggestions('Asset number 42 of the plant', objects)[0]).toEqual({
      elementId: objects[42]!.elementId,
      displayName: 'Asset number 42 of the plant',
    });
  });
});

describe('history not supported', () => {
  it('reports a component the server cannot read history for, not zero-count stats', async () => {
    const deps = makeDeps({}, (ds) => {
      const read = ds.readHistory.bind(ds);
      ds.readHistory = async (...args: Parameters<typeof ds.readHistory>) => {
        // Neither the Object nor its variable keeps history.
        if (args[0] === 'ns=2;s=Speed' || args[0] === 'ns=2;s=Motor')
          throw new Error('BadHistoryOperationUnsupported');
        return read(...args);
      };
    });
    const binding = new InProcessConnectorBinding(deps);
    const { Motor, Speed } = await idsByName(binding);

    const res = await handleQueryTelemetry(binding, {
      elementIds: [Motor!],
      mode: 'history',
      aggregateStats: true,
      maxDepth: 2,
    });
    const report = res.telemetryReports?.[0] as Record<string, unknown>;
    expect(report.components).toEqual({
      [Speed!]: { error: '501 Not Implemented History read not supported' },
    });
    expect(report.note).toMatch(/No component history could be read/);
  });
});
