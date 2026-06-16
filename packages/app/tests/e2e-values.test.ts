// ─────────────────────────────────────────────────────────────
// E2E: Value read/write (UPD conformance)
// ─────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2EContext, setupE2E, teardownE2E } from './helpers/e2e-setup.js';

describe('E2E: Values (read / write)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await setupE2E();
  }, 30_000);

  afterAll(async () => {
    await teardownE2E(ctx);
  }, 15_000);

  // ── Value reads ──────────────────────────────────────────

  it('POST /v1/objects/value reads real OPC UA variable values', async () => {
    const model = await ctx.modelService.getOrBuildModel();

    // Find a property node (a Variable)
    const propId = [...model.propertyToSource.keys()][0]!;

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [propId], maxDepth: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].result.value).not.toBeNull();
    expect(body.results[0].result.quality).toBe('Good');
  });

  it('POST /v1/objects/value returns composition for asset nodes', async () => {
    const model = await ctx.modelService.getOrBuildModel();

    // Find a root asset with children
    const assetId = model.rootIds.find((id) => {
      const node = model.nodesById.get(id);
      return node && node.children.length > 0;
    });

    if (!assetId) return; // skip if server has no suitable nodes

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [assetId], maxDepth: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].result.isComposition).toBe(true);
  });

  // ── UPD conformance (E2E) ──────────────────────────────

  it('UPD-01 E2E: PUT /objects/value writes and reads back via real OPC UA', async () => {
    // Step 1: GET /objects — find the "Temperature" property
    // from Machine A (known writable)
    const objRes = await ctx.app.inject({
      method: 'GET',
      url: '/v1/objects',
    });
    expect(objRes.statusCode).toBe(200);
    const objects = objRes.json().result;

    // Pick a Temperature property (known writable)
    const tempObj = objects.find((o: any) => o.displayName === 'Temperature');
    expect(tempObj).toBeDefined();
    const eid = tempObj.elementId;

    // Step 2: POST /objects/value — read current value
    const valRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [eid] },
    });
    expect(valRes.statusCode).toBe(200);
    const valResult = valRes.json().results[0];
    expect(valResult.success).toBe(true);
    expect(valResult.result.isComposition).toBe(false);
    const currentValue = valResult.result.value;

    // Step 3: PUT /objects/value — write the value back
    const writeRes = await ctx.app.inject({
      method: 'PUT',
      url: '/v1/objects/value',
      payload: {
        updates: [{ elementId: eid, value: currentValue }],
      },
    });

    expect(writeRes.statusCode).toBe(200);
    const writeBody = writeRes.json();

    // Debug: print the write response if it fails
    if (!writeBody.success) {
      console.log('UPD-01 E2E write failed:', JSON.stringify(writeBody, null, 2));
      console.log('elementId:', eid, 'value:', currentValue);
    }

    expect(writeBody.success).toBe(true);
    expect(writeBody.results).toHaveLength(1);
    expect(writeBody.results[0].success).toBe(true);
  });
});
