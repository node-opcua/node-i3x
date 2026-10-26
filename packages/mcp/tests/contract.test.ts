// Contract tests: the MCP client against the real node-i3x rest-server routes,
// in-process through Fastify inject() (no port), instead of a hand-written mock.
import { beforeAll, describe, expect, it } from 'vitest';
import { RestClientBinding } from '../src/bindings/rest-binding.js';
import { InProcessConnectorBinding, injectFetch } from '../src/in-process.js';
import { handleExploreHierarchy } from '../src/tools/explore-hierarchy.js';
import { handleInspectAsset } from '../src/tools/inspect-asset.js';
import { makeDeps } from './helpers/contract-fixture.js';

describe('MCP client against the real rest-server', () => {
  let binding: InProcessConnectorBinding;
  let machineId: string;
  let motorId: string;

  beforeAll(async () => {
    binding = new InProcessConnectorBinding(makeDeps());
    const all = await binding.getObjects();
    machineId = all.find((o) => o.displayName === 'Machine')!.elementId;
    motorId = all.find((o) => o.displayName === 'Motor')!.elementId;
  });

  it('unwraps the envelope: roots have parentId null, children their parent', async () => {
    const roots = await binding.getObjects({ rootOnly: true });
    expect(roots.map((o) => [o.displayName, o.parentId])).toEqual([['Machine', null]]);
    const motor = await binding.getObjectById(motorId);
    expect(motor?.parentId).toBe(machineId);
  });

  it('reports the real server info', async () => {
    const info = await binding.getInfo();
    expect(info).toMatchObject({
      serverName: 'node-i3x',
      capabilities: { update: { history: false } },
    });
  });

  it('maps a 404 item to null and lists objects by displayName in suggestions', async () => {
    expect(await binding.getObjectById('instance-does-not-exist')).toBeNull();
    const res = await handleInspectAsset(binding, {
      elementId: 'Motr',
      includeValues: false,
      includeSchema: false,
      maxDepth: 2,
    });
    expect(res).toMatchObject({
      error: "Asset 'Motr' not found in i3X address space.",
      suggestions: [{ elementId: motorId, displayName: 'Motor' }],
    });
  });

  it('keeps the relationship, and the parent out of sub-components and the tree', async () => {
    const related = await binding.getRelatedObjects(motorId);
    expect(related.map((r) => [r.sourceRelationship, r.object.displayName])).toEqual([
      ['HasComponent', 'Speed'],
      ['IsComponentOf', 'Machine'],
    ]);

    const inspected = await handleInspectAsset(binding, {
      elementId: motorId,
      includeValues: false,
      includeSchema: false,
      maxDepth: 2,
    });
    expect(inspected).toMatchObject({
      parentId: machineId,
      subComponents: [{ displayName: 'Speed', relationship: 'HasComponent' }],
    });

    const tree = await handleExploreHierarchy(binding, { maxDepth: 3 });
    const motor = tree.plantTopology?.[0]?.children?.find(
      (c) => c.displayName === 'Motor',
    );
    expect(motor?.children?.map((c) => c.displayName)).toEqual(['Speed']);
  });

  it('reads component values at maxDepth 2, none at maxDepth 1', async () => {
    const [deep] = await binding.getObjectValues([motorId], 2);
    expect(deep?.elementId).toBe(motorId);
    expect(Object.values(deep?.result?.components ?? {})).toEqual([
      expect.objectContaining({ value: 1500, quality: 'Good' }),
    ]);
    const [shallow] = await binding.getObjectValues([motorId], 1);
    expect(shallow?.result?.components ?? null).toBeNull();

    const inspected = await handleInspectAsset(binding, {
      elementId: motorId,
      includeValues: true,
      includeSchema: false,
      maxDepth: 2,
    });
    expect(inspected).toMatchObject({ currentValues: { isComposition: true } });
  });

  it('pairs bulk value results with their elementId, failures included', async () => {
    const res = await binding.getObjectValues(['instance-does-not-exist', motorId], 2);
    expect(res.map((r) => [r.elementId, Boolean(r.result), Boolean(r.error)])).toEqual([
      ['instance-does-not-exist', false, true],
      [motorId, true, false],
    ]);
  });

  it.each(['http://i3x.example/api/i3x/abc', 'http://i3x.example/api/i3x/abc/v1'])(
    'a remote client reaches the routes with base URL %s',
    async (baseUrl) => {
      const deps = makeDeps();
      // The rest-server is mounted at the root; drop the portal-style prefix.
      const inject = injectFetch(deps);
      const viaPrefix: typeof fetch = (input, init) =>
        inject(String(input).replace('/api/i3x/abc', ''), init);
      const client = new RestClientBinding(baseUrl, undefined, 15_000, viaPrefix);
      const roots = await client.getObjects({ rootOnly: true });
      expect(roots.map((o) => o.displayName)).toEqual(['Machine']);
    },
  );

  it('surfaces an auth failure instead of "not found"', async () => {
    // injectFetch disables requireAuth for in-process use, so build a remote-style
    // client that sends no token to an app that requires one.
    const { createApp } = await import('@node-i3x/rest-server');
    const app = await createApp(makeDeps({ apiKey: 'secret' }), { logger: false });
    const noToken: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const res = await app.inject({
        method: (init?.method ?? 'GET') as 'GET' | 'POST',
        url: `${url.pathname}${url.search}`,
        payload: typeof init?.body === 'string' ? init.body : undefined,
        headers: { 'content-type': 'application/json' },
      });
      return new Response(res.body, { status: res.statusCode });
    };
    const client = new RestClientBinding(
      'http://i3x.example',
      undefined,
      15_000,
      noToken,
    );
    await expect(
      handleInspectAsset(client, {
        elementId: 'whatever',
        includeValues: true,
        includeSchema: true,
        maxDepth: 2,
      }),
    ).rejects.toThrow(/HTTP 401/);
  });
});
