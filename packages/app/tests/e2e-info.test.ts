// ─────────────────────────────────────────────────────────────
// E2E: Info, health, and readiness endpoints
// ─────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2EContext, setupE2E, teardownE2E } from './helpers/e2e-setup.js';

describe('E2E: Info / Health / Ready', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E(ctx);
  }, 15_000);

  // ── Info ─────────────────────────────────────────────────

  it('GET /v1/info returns server capabilities', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/info',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.result.specVersion).toBe('1.0');
    expect(body.result.capabilities.query.history).toBe(true);
  });

  // ── Health ───────────────────────────────────────────────

  it('GET /health returns ok', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /ready returns ready when connected', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/ready',
    });
    expect(res.statusCode).toBe(200);
  });
});
