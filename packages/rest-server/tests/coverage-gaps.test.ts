import {
  HistoryService,
  ModelService,
  nullLogger,
  SubscriptionService,
  TypeService,
  ValueService,
} from '@node-i3x/core';
import { createApp } from '@node-i3x/rest-server';
import { beforeAll, describe, expect, it } from 'vitest';
import { MockDataSource } from './helpers/mock-data-source.js';

// ── errors.ts coverage ─────────────────────────────────────────
describe('errors — i3xError and rethrowAsI3x', () => {
  it('rethrowAsI3x preserves statusCode from original error', async () => {
    // We test rethrowAsI3x indirectly: the subscription register
    // route calls rethrowAsI3x when the service throws.
    // Trigger it via an invalid subscription id so
    // requireSubscriptionOwnership throws a 404 (i3xError),
    // which flows through the error handler.
    const ds = new MockDataSource();
    const logger = nullLogger;
    const modelService = new ModelService(ds, logger);
    const valueService = new ValueService(ds, modelService, logger);
    const historyService = new HistoryService(ds, modelService, logger);
    const subscriptionService = new SubscriptionService(
      ds,
      modelService,
      logger,
      1000,
      250,
    );
    const typeService = new TypeService(ds, logger);

    const app = await createApp({
      dataSource: ds,
      modelService,
      typeService,
      valueService,
      historyService,
      subscriptionService,
      logger,
    });

    // Create a subscription, then register with an invalid elementId
    // that will cause the service to throw internally.
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'err-test', displayName: 'Err Sub' },
    });
    const _subId = createRes.json().result.subscriptionId;

    // Register with a non-existent elementId — the service returns
    // it in the errors array, NOT via rethrowAsI3x.  We need to
    // trigger an actual throw.  The sync route also uses
    // rethrowAsI3x:
    const syncRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: 'does-not-exist',
        clientId: 'err-test',
      },
    });
    // requireSubscriptionOwnership throws i3xError(404, ...)
    expect(syncRes.statusCode).toBe(404);
    const body = syncRes.json();
    expect(body.success).toBe(false);
    expect(body.responseDetail.status).toBe(404);
    expect(body.responseDetail.title).toBe('Not Found');
  });

  it('rethrowAsI3x defaults to 500 when error has no statusCode', async () => {
    // Import and call rethrowAsI3x directly via relative path
    const { rethrowAsI3x } = await import('../src/errors.js');
    const plainError = new Error('something broke');
    try {
      rethrowAsI3x(plainError);
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(500);
      expect(err.message).toBe('something broke');
    }
  });

  it('rethrowAsI3x preserves statusCode from i3xError', async () => {
    const { rethrowAsI3x, i3xError } = await import('../src/errors.js');
    const original = i3xError(422, 'invalid');
    try {
      rethrowAsI3x(original);
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(422);
      expect(err.message).toBe('invalid');
    }
  });
});

// ── health.ts — /ready 503 path ────────────────────────────────
describe('health — /ready 503 when not connected', () => {
  it('GET /ready returns 503 when dataSource is not connected', async () => {
    const ds = new MockDataSource();
    ds.connected = false; // Simulate disconnected state
    const logger = nullLogger;
    const modelService = new ModelService(ds, logger);
    const valueService = new ValueService(ds, modelService, logger);
    const historyService = new HistoryService(ds, modelService, logger);
    const subscriptionService = new SubscriptionService(
      ds,
      modelService,
      logger,
      1000,
      250,
    );
    const typeService = new TypeService(ds, logger);

    const app = await createApp({
      dataSource: ds,
      modelService,
      typeService,
      valueService,
      historyService,
      subscriptionService,
      logger,
    });

    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('not ready');
    expect(body.message).toBe('Data source not connected');
  });
});

// ── subscriptions.ts — additional coverage ─────────────────────
describe('subscriptions — additional coverage', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let modelService: ModelService;
  let subscriptionService: SubscriptionService;

  beforeAll(async () => {
    const ds = new MockDataSource();
    const logger = nullLogger;
    modelService = new ModelService(ds, logger);
    const valueService = new ValueService(ds, modelService, logger);
    const historyService = new HistoryService(ds, modelService, logger);
    subscriptionService = new SubscriptionService(ds, modelService, logger, 1000, 250);
    const typeService = new TypeService(ds, logger);

    app = await createApp({
      dataSource: ds,
      modelService,
      typeService,
      valueService,
      historyService,
      subscriptionService,
      logger,
      experimental: true,
    });

    await modelService.preloadModel();
  });

  // ── POST /v1/subscriptions/list — list all subscriptions ───
  it('POST /v1/subscriptions/list returns all subs for client', async () => {
    // Create two subscriptions for same client
    await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'list-test', displayName: 'List Sub 1' },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'list-test', displayName: 'List Sub 2' },
    });

    // List without specifying subscriptionIds → returns all for client
    const res = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/list',
      payload: { clientId: 'list-test' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.results.length).toBeGreaterThanOrEqual(2);
    for (const r of body.results) {
      expect(r.success).toBe(true);
      expect(r.result.clientId).toBe('list-test');
    }
  });

  // ── POST /v1/subscriptions/list — not-found sub id ─────────
  it('POST /v1/subscriptions/list returns 404 for unknown sub', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/list',
      payload: {
        subscriptionIds: ['does-not-exist'],
        clientId: 'list-test',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].subscriptionId).toBe('does-not-exist');
    expect(body.results[0].responseDetail.status).toBe(404);
  });

  // ── POST /v1/subscriptions/list — wrong client id ──────────
  it('POST /v1/subscriptions/list hides subs from other clients', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'owner-a', displayName: 'Owner A Sub' },
    });
    const subId = createRes.json().result.subscriptionId;

    // List with different clientId
    const res = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/list',
      payload: { subscriptionIds: [subId], clientId: 'owner-b' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].responseDetail.status).toBe(404);
  });

  // ── requireClientId — empty string triggers 400 ────────────
  it('POST /v1/subscriptions/sync rejects empty clientId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: 'any',
        clientId: '',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.responseDetail.detail).toContain('clientId is required');
  });

  // ── requireSubscriptionOwnership — wrong client ────────────
  it('POST /v1/subscriptions/sync rejects wrong client', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'real-owner', displayName: 'Owned Sub' },
    });
    const subId = createRes.json().result.subscriptionId;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: subId,
        clientId: 'impostor',
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().responseDetail.detail).toContain('not found');
  });

  // ── register error path — invalid elementId ────────────────
  it('POST /v1/subscriptions/register reports invalid elementId', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'reg-err', displayName: 'Reg Err Sub' },
    });
    const subId = createRes.json().result.subscriptionId;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: {
        subscriptionId: subId,
        elementIds: ['non-existent-element'],
        maxDepth: 1,
        clientId: 'reg-err',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Invalid elementId produces an error in the bulk results
    expect(body.success).toBe(false);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].elementId).toBe('non-existent-element');
    expect(body.results[0].responseDetail.status).toBe(404);
  });
});

// ── objects.ts — 501 endpoints and related errors ──────────────
describe('objects — 501 endpoints and related errors', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let modelService: ModelService;

  beforeAll(async () => {
    const ds = new MockDataSource();
    const logger = nullLogger;
    modelService = new ModelService(ds, logger);
    const valueService = new ValueService(ds, modelService, logger);
    const historyService = new HistoryService(ds, modelService, logger);
    const subscriptionService = new SubscriptionService(
      ds,
      modelService,
      logger,
      1000,
      250,
    );
    const typeService = new TypeService(ds, logger);

    app = await createApp({
      dataSource: ds,
      modelService,
      typeService,
      valueService,
      historyService,
      subscriptionService,
      logger,
      experimental: true, // Required for :elementId routes
    });

    await modelService.preloadModel();
  });

  it('GET /v1/objects/:elementId/history returns 501', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/objects/some-element/history',
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.responseDetail.title).toBe('Not Implemented');
    expect(body.responseDetail.status).toBe(501);
  });

  it('PUT /v1/objects/:elementId/history returns 501', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/objects/some-element/history',
      payload: {},
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.responseDetail.title).toBe('Not Implemented');
  });

  it('PUT /v1/objects/history returns 501', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/objects/history',
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.responseDetail.title).toBe('Not Implemented');
  });

  it('POST /v1/objects/related returns 404 for mixed ids', async () => {
    const model = await modelService.getOrBuildModel();
    const machineId = model.rootIds[0]!;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/objects/related',
      payload: { elementIds: [machineId, 'totally-invalid'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    // First result should succeed
    expect(body.results[0].success).toBe(true);
    // Second result should fail with 404
    expect(body.results[1].success).toBe(false);
    expect(body.results[1].elementId).toBe('totally-invalid');
    expect(body.results[1].responseDetail.status).toBe(404);
  });
});

// ── relationshiptypes.ts — query error path ────────────────────
describe('relationshiptypes — query error path', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    const ds = new MockDataSource();
    const logger = nullLogger;
    const modelService = new ModelService(ds, logger);
    const valueService = new ValueService(ds, modelService, logger);
    const historyService = new HistoryService(ds, modelService, logger);
    const subscriptionService = new SubscriptionService(
      ds,
      modelService,
      logger,
      1000,
      250,
    );
    const typeService = new TypeService(ds, logger);

    app = await createApp({
      dataSource: ds,
      modelService,
      typeService,
      valueService,
      historyService,
      subscriptionService,
      logger,
    });
  });

  it('POST /v1/relationshiptypes/query returns 404 for unknown type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/relationshiptypes/query',
      payload: { elementIds: ['NonExistentType'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].elementId).toBe('NonExistentType');
    expect(body.results[0].responseDetail.status).toBe(404);
    expect(body.results[0].responseDetail.detail).toBe('Relationship type not found');
  });
});
