import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestClientBinding } from '../src/bindings/rest-binding.js';
import { handleInspectAsset } from '../src/tools/inspect-asset.js';

// Payloads below mirror what a node-i3x server (packages/rest-server) answers.

const machine = {
  elementId: 'instance-1f7ad67cf3247a9d',
  displayName: 'CoffeeMachineA',
  typeElementId: 'CoffeeMachineType',
  parentId: 'instance-plant',
  isComposition: true,
};
const boiler = {
  elementId: 'instance-boiler',
  displayName: 'Boiler',
  parentId: machine.elementId,
  isComposition: false,
};
const plant = { elementId: 'instance-plant', displayName: 'Plant', isComposition: true };

type Route = (body: Record<string, unknown> | undefined) => {
  status?: number;
  json: unknown;
};

let routes: Record<string, Route>;
let calls: Array<{ url: string; body?: Record<string, unknown> }>;

beforeEach(() => {
  routes = {};
  calls = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const path = new URL(url).pathname.replace(/^\/api\/i3x\/abc/, '');
    const route = routes[path];
    if (!route) return new Response('Not Found', { status: 404 });
    const { status = 200, json } = route(body);
    return new Response(JSON.stringify(json), { status });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const elementIdsOf = (body?: Record<string, unknown>) =>
  (body?.elementIds ?? []) as string[];
const ok = (result: unknown) => () => ({ json: { success: true, result } });
const bulk = (fn: (id: string) => unknown) => (body?: Record<string, unknown>) => ({
  json: {
    success: true,
    results: elementIdsOf(body).map((elementId) => ({
      success: true,
      elementId,
      result: fn(elementId),
    })),
  },
});

describe('RestClientBinding', () => {
  describe('base URL', () => {
    it.each([
      'https://portal.example/api/i3x/abc',
      'https://portal.example/api/i3x/abc/',
      'https://portal.example/api/i3x/abc/v1',
      'https://portal.example/api/i3x/abc/v1/',
    ])('accepts %s', async (baseUrl) => {
      routes['/v1/objects'] = ok([plant]);
      const objects = await new RestClientBinding(baseUrl).getObjects({ rootOnly: true });
      expect(objects).toEqual([plant]);
      expect(calls[0]?.url).toBe(
        'https://portal.example/api/i3x/abc/v1/objects?root=true',
      );
    });
  });

  describe('success envelope', () => {
    const client = () => new RestClientBinding('https://portal.example/api/i3x/abc');

    it('unwraps result for objects, namespaces, types and info', async () => {
      routes['/v1/objects'] = ok([plant, machine]);
      routes['/v1/namespaces'] = ok([{ uri: 'urn:ns', displayName: 'NS' }]);
      routes['/v1/objecttypes'] = ok([{ elementId: 'CoffeeMachineType' }]);
      routes['/v1/relationshiptypes'] = ok([{ elementId: 'HasComponent' }]);
      routes['/v1/info'] = ok({ serverName: 'node-i3x', specVersion: '1.0' });

      const c = client();
      expect(await c.getObjects()).toEqual([plant, machine]);
      expect(await c.getNamespaces()).toEqual([{ uri: 'urn:ns', displayName: 'NS' }]);
      expect(await c.getObjectTypes()).toEqual([{ elementId: 'CoffeeMachineType' }]);
      expect(await c.getRelationshipTypes()).toEqual([{ elementId: 'HasComponent' }]);
      expect(await c.getInfo()).toMatchObject({ serverName: 'node-i3x' });
    });

    it('unwraps bulk results for list, value and history', async () => {
      routes['/v1/objects/list'] = bulk(() => machine);
      routes['/v1/objects/value'] = bulk(() => ({
        isComposition: false,
        value: 92.5,
        quality: 'Good',
        timestamp: '2026-10-25T10:00:00Z',
      }));
      routes['/v1/objects/history'] = bulk(() => ({
        isComposition: false,
        values: [{ value: 1, quality: 'Good', timestamp: '2026-10-25T10:00:00Z' }],
      }));

      const c = client();
      expect(await c.getObjectById(machine.elementId)).toEqual(machine);
      expect(await c.getObjectValues([machine.elementId])).toEqual([
        {
          isComposition: false,
          value: 92.5,
          quality: 'Good',
          timestamp: '2026-10-25T10:00:00Z',
        },
      ]);
      const history = await c.getHistoricalValues(
        [machine.elementId],
        '2026-10-25T00:00:00Z',
        '2026-10-25T12:00:00Z',
      );
      expect(history[0]?.values).toHaveLength(1);
    });

    it('sends elementIds to /v1/objects/related and reads the related objects', async () => {
      routes['/v1/objects/related'] = bulk(() => [
        { sourceRelationship: 'HasComponent', object: boiler },
        { sourceRelationship: 'IsComponentOf', object: plant },
      ]);

      const c = client();
      expect(await c.getRelatedObjects(machine.elementId)).toEqual([boiler, plant]);
      expect(calls[0]?.body).toEqual({ elementIds: [machine.elementId] });
      expect(await c.getRelatedObjects(machine.elementId, 'HasComponent')).toEqual([
        boiler,
      ]);
    });

    it('returns null from getObjectById for a 404 item', async () => {
      routes['/v1/objects/list'] = (body) => ({
        json: {
          success: false,
          results: [
            {
              success: false,
              elementId: elementIdsOf(body)[0],
              responseDetail: { title: 'Error', status: 404, detail: 'Not found' },
            },
          ],
        },
      });
      expect(await client().getObjectById('nope')).toBeNull();
    });
  });

  describe('error envelope', () => {
    const client = () => new RestClientBinding('https://portal.example/api/i3x/abc');

    it('throws the responseDetail of a success:false envelope instead of returning []', async () => {
      routes['/v1/objects'] = () => ({
        json: {
          success: false,
          responseDetail: { title: 'Internal Server Error', status: 500, detail: 'boom' },
        },
      });
      await expect(client().getObjects()).rejects.toThrow(
        /500 Internal Server Error boom/,
      );
    });

    it('throws on a body without the envelope instead of returning []', async () => {
      routes['/v1/namespaces'] = () => ({ json: { namespaces: [] } });
      await expect(client().getNamespaces()).rejects.toThrow(/unexpected response/);
    });

    it('throws for a failed bulk item, naming its elementId', async () => {
      routes['/v1/objects/value'] = () => ({
        json: {
          success: false,
          results: [
            {
              success: false,
              elementId: 'bad-id',
              responseDetail: { title: 'Error', status: 404, detail: 'Not found' },
            },
          ],
        },
      });
      await expect(client().getObjectValues(['bad-id'])).rejects.toThrow(
        /'bad-id': 404 Error Not found/,
      );
    });

    it('getObjectById propagates a non-404 failure instead of reporting "not found"', async () => {
      routes['/v1/objects/list'] = () => ({
        status: 401,
        json: {
          success: false,
          responseDetail: { title: 'Unauthorized', status: 401, detail: 'bad token' },
        },
      });
      await expect(client().getObjectById(machine.elementId)).rejects.toThrow(/HTTP 401/);
    });
  });

  it('i3x_inspect_asset lists children, not the parent, as sub-components', async () => {
    routes['/v1/objects/list'] = bulk(() => machine);
    routes['/v1/objects/related'] = bulk(() => [
      { sourceRelationship: 'HasComponent', object: boiler },
      { sourceRelationship: 'IsComponentOf', object: plant },
    ]);
    routes['/v1/objects/value'] = bulk(() => ({
      isComposition: true,
      value: { Temperature: 92.5 },
      quality: 'Good',
      timestamp: '2026-10-25T10:00:00Z',
    }));

    const res = await handleInspectAsset(
      new RestClientBinding('https://portal.example/api/i3x/abc/v1'),
      { elementId: machine.elementId, includeValues: true, includeSchema: false },
    );
    expect(res).toMatchObject({
      elementId: machine.elementId,
      displayName: 'CoffeeMachineA',
      subComponents: [{ elementId: boiler.elementId }],
      currentValues: { value: { Temperature: 92.5 } },
    });
    expect((res as { subComponents: unknown[] }).subComponents).toHaveLength(1);
    expect(calls.find((c) => c.url.endsWith('/v1/objects/value'))?.body).toMatchObject({
      maxDepth: 2,
    });
  });
});
