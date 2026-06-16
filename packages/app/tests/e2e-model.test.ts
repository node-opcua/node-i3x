// ─────────────────────────────────────────────────────────────
// E2E: Namespaces, object types, relationship types, objects
// ─────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2EContext, setupE2E, teardownE2E } from './helpers/e2e-setup.js';

describe('E2E: Model (namespaces, types, objects)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E(ctx);
  }, 15_000);

  // ── Namespaces ───────────────────────────────────────────

  it('GET /v1/namespaces returns real OPC UA namespaces', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/namespaces',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.length).toBeGreaterThanOrEqual(2);
    // First namespace is always the OPC UA standard namespace
    expect(body.result[0].uri).toContain('opcfoundation.org');
  });

  // ── Object types ─────────────────────────────────────────

  it('GET /v1/objecttypes returns browsed types', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/objecttypes',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.length).toBeGreaterThanOrEqual(1);
  });

  // ── Objects ──────────────────────────────────────────────

  it('GET /v1/objects returns root-level objects from OPC UA', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/objects',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.length).toBeGreaterThanOrEqual(1);
    // Should find our ProductionLine
    const names = body.result.map((r: Record<string, string>) => r.displayName);
    expect(names).toContain('Production Line #1');
  });

  it('POST /v1/objects/list resolves a real element by id', async () => {
    const model = await ctx.modelService.getOrBuildModel();
    const rootId = model.rootIds[0]!;

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/objects/list',
      payload: { elementIds: [rootId] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].result.displayName).toBeTruthy();
  });

  // ── Error handling ───────────────────────────────────────

  it('POST /v1/objects/list returns 404 for unknown elements', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/objects/list',
      payload: { elementIds: ['nonexistent-element-id'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].responseDetail.status).toBe(404);
  });
});
