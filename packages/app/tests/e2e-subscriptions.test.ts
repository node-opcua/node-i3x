// ─────────────────────────────────────────────────────────────
// E2E: Subscription lifecycle, deep subscribe, composite
// values, SUB-07, SUB-13 conformance
// ─────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2EContext, setupE2E, teardownE2E } from './helpers/e2e-setup.js';

describe('E2E: Subscriptions', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E(ctx);
  }, 15_000);

  // ── Full lifecycle ───────────────────────────────────────

  it('full subscription lifecycle: create → register → sync → delete', async () => {
    const model = await ctx.modelService.getOrBuildModel();
    const propId = [...model.propertyToSource.keys()][0]!;

    // Create subscription
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: {
        clientId: 'e2e-test',
        displayName: 'E2E Subscription',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const subId = createRes.json().result.subscriptionId;
    expect(subId).toBeTruthy();

    // Register a monitored item
    const regRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: {
        subscriptionId: subId,
        elementIds: [propId],
        maxDepth: 1,
        clientId: 'e2e-test',
      },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.json().success).toBe(true);
    expect(regRes.json().results[0].success).toBe(true);
    expect(regRes.json().results[0].elementId).toBe(propId);

    // Wait a moment for data changes to arrive
    await new Promise((r) => setTimeout(r, 2000));

    // Sync — should have updates
    const syncRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: subId,
        lastSequenceNumber: 0,
        clientId: 'e2e-test',
      },
    });
    expect(syncRes.statusCode).toBe(200);
    const updates = syncRes.json().result;
    // Updates may or may not be there depending on timing,
    // but the call must succeed
    expect(Array.isArray(updates)).toBe(true);

    // List subscriptions
    const listRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/list',
      payload: {
        subscriptionIds: [subId],
        clientId: 'e2e-test',
      },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().results[0].success).toBe(true);
    expect(listRes.json().results[0].subscriptionId).toBe(subId);
    expect(listRes.json().results[0].result.subscriptionId).toBe(subId);

    // Delete
    const delRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/delete',
      payload: {
        subscriptionIds: [subId],
        clientId: 'e2e-test',
      },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().results[0].success).toBe(true);
  }, 15_000);

  // ── Deep subscription: CoffeeMachine nested monitoring ──

  it('deep subscribe: monitoring CoffeeMachine auto-discovers nested ParameterSet + GrinderUnit variables', async () => {
    const model = await ctx.modelService.getOrBuildModel();

    // 1. Find the CoffeeMachine asset (top-level object)
    const coffeeNode = [...model.nodesById.values()].find(
      (n) => n.name === 'Coffee Machine Pro 3000',
    );
    expect(coffeeNode).toBeTruthy();
    const coffeeId = coffeeNode!.id;

    // Verify nested structure exists in the model
    const childIds = model.childrenById.get(coffeeId) ?? [];
    expect(childIds.length).toBeGreaterThanOrEqual(2); // ParameterSet + GrinderUnit

    // Find ParameterSet children
    const paramSetNode = [...model.nodesById.values()].find(
      (n) => n.name === 'ParameterSet' && childIds.includes(n.id),
    );
    expect(paramSetNode).toBeTruthy();

    const paramChildren = model.childrenById.get(paramSetNode!.id) ?? [];
    const paramPropertyNames = paramChildren
      .map((id) => model.nodesById.get(id))
      .filter(Boolean)
      .filter((n) => n!.kind === 'property')
      .map((n) => n!.name);
    expect(paramPropertyNames).toContain('Brew Temperature');
    expect(paramPropertyNames).toContain('Pump Pressure');
    expect(paramPropertyNames).toContain('Water Level');

    // Find GrinderUnit children
    const grinderNode = [...model.nodesById.values()].find(
      (n) => n.name === 'Grinder Unit' && childIds.includes(n.id),
    );
    expect(grinderNode).toBeTruthy();

    const grinderChildren = model.childrenById.get(grinderNode!.id) ?? [];
    const grinderPropertyNames = grinderChildren
      .map((id) => model.nodesById.get(id))
      .filter(Boolean)
      .filter((n) => n!.kind === 'property')
      .map((n) => n!.name);
    expect(grinderPropertyNames).toContain('Grinder RPM');
    expect(grinderPropertyNames).toContain('Grind Size');

    // 2. Create subscription
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: {
        clientId: 'deep-test',
        displayName: 'Deep CoffeeMachine Sub',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const subId = createRes.json().result.subscriptionId;

    // 3. Register the TOP-LEVEL CoffeeMachine with maxDepth=3
    //    This should auto-discover ALL nested variables:
    //    CoffeeMachine (depth 0)
    //      → ParameterSet (depth 1)
    //          → BrewTemperature, PumpPressure, WaterLevel (depth 2, property)
    //      → GrinderUnit (depth 1)
    //          → RPM, GrindSize (depth 2, property)
    const regRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: {
        subscriptionId: subId,
        elementIds: [coffeeId],
        maxDepth: 3,
        clientId: 'deep-test',
      },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.json().success).toBe(true);
    expect(regRes.json().results[0].success).toBe(true);
    expect(regRes.json().results[0].elementId).toBe(coffeeId);

    // 4. Verify list shows the CoffeeMachine as monitored
    const listRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/list',
      payload: {
        subscriptionIds: [subId],
        clientId: 'deep-test',
      },
    });
    expect(listRes.statusCode).toBe(200);
    const detail = listRes.json().results[0].result;
    expect(detail.monitoredObjects).toHaveLength(1);
    expect(detail.monitoredObjects[0].elementId).toBe(coffeeId);
    expect(detail.monitoredObjects[0].maxDepth).toBe(3);
    // Should be running in native mode (real OPC UA subscription)
    expect(detail.mode).toBe('native');

    // 5. Wait for data change notifications
    //    Values change every 200ms, subscription publishes at 1s
    //    → after 3s we should have multiple notifications
    await new Promise((r) => setTimeout(r, 3000));

    // 6. Sync — should have composite updates for the CoffeeMachine
    const syncRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: subId,
        lastSequenceNumber: 0,
        clientId: 'deep-test',
      },
    });
    expect(syncRes.statusCode).toBe(200);
    const updates = syncRes.json().result.flatMap((b: any) =>
      b.updates.map((u: any) => ({
        ...u,
        sequenceNumber: b.sequenceNumber,
      })),
    );
    expect(Array.isArray(updates)).toBe(true);
    expect(updates.length).toBeGreaterThan(0);

    // With composite values, all updates have elementId = CoffeeMachine
    for (const update of updates) {
      expect(update.elementId).toBe(coffeeId);
      expect(update.sequenceNumber).toBeGreaterThan(0);
      expect(update.timestamp).toBeTruthy();
    }

    // The latest update should be a composite with components
    // from nested properties (BrewTemperature, PumpPressure, etc.)
    const latest = updates[updates.length - 1];
    expect(latest.value).toBeTruthy();
    expect(latest.value.isComposition).toBe(true);
    expect(latest.value.components).toBeTruthy();

    const componentKeys = Object.keys(latest.value.components);
    // Should have at least 3 nested property components
    expect(componentKeys.length).toBeGreaterThanOrEqual(3);

    // Each component should be a VQT
    for (const key of componentKeys) {
      const vqt = latest.value.components[key];
      expect(vqt.quality).toBeTruthy();
      expect(vqt.timestamp).toBeTruthy();
      // Value should be defined (initial data change fired)
      expect(vqt.value).toBeDefined();
    }

    // ── Print evidence ──
    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║  Deep Subscription: CoffeeMachine composite       ║`);
    console.log(
      `║  ${updates.length} updates, ${componentKeys.length} components                    ║`,
    );
    console.log(`╠══════════════════════════════════════════════════╣`);
    for (const key of componentKeys) {
      const vqt = latest.value.components[key];
      const name = model.nodesById.get(key)?.name ?? key;
      const val =
        typeof vqt.value === 'number' ? vqt.value.toFixed(2) : String(vqt.value);
      console.log(`║  ${name.padEnd(20)} │ ${val}`);
    }
    console.log(`╚══════════════════════════════════════════════════╝\n`);

    // 7. Cleanup
    const delRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/delete',
      payload: {
        subscriptionIds: [subId],
        clientId: 'deep-test',
      },
    });
    expect(delRes.statusCode).toBe(200);
  }, 20_000);

  // ── Subscription value must match /objects/value shape ──

  it('subscription composite matches /objects/value format for the same asset', async () => {
    const model = await ctx.modelService.getOrBuildModel();

    // Find the CoffeeMachine asset
    const coffeeNode = [...model.nodesById.values()].find(
      (n) => n.name === 'Coffee Machine Pro 3000',
    );
    expect(coffeeNode).toBeTruthy();
    const coffeeId = coffeeNode!.id;

    // ── Step 1: Read the canonical value via /objects/value ──
    const valueRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/objects/value',
      payload: { elementIds: [coffeeId], maxDepth: 3 },
    });
    expect(valueRes.statusCode).toBe(200);
    const valueResult = valueRes.json().results[0].result;
    expect(valueResult.isComposition).toBe(true);
    expect(valueResult.components).toBeTruthy();

    const canonicalKeys = Object.keys(valueResult.components).sort();
    expect(canonicalKeys.length).toBeGreaterThanOrEqual(3);

    // ── Step 2: Create subscription and register same asset ──
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: { clientId: 'match-test' },
    });
    const subId = createRes.json().result.subscriptionId;

    const regRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: {
        subscriptionId: subId,
        elementIds: [coffeeId],
        maxDepth: 3,
        clientId: 'match-test',
      },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.json().results[0].success).toBe(true);

    // ── Step 3: Wait for initial data, then sync ──
    await new Promise((r) => setTimeout(r, 3000));

    const syncRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: subId,
        lastSequenceNumber: 0,
        clientId: 'match-test',
      },
    });
    expect(syncRes.statusCode).toBe(200);
    const updates = syncRes.json().result.flatMap((b: any) =>
      b.updates.map((u: any) => ({
        ...u,
        sequenceNumber: b.sequenceNumber,
      })),
    );
    expect(updates.length).toBeGreaterThan(0);

    // ── Step 4: The critical assertion ──
    // The latest sync update must have the SAME component keys
    // as /objects/value — if they differ, the explorer can't
    // correlate subscription data with its object model.
    const latest = updates[updates.length - 1];

    // elementId must match what we registered
    expect(latest.elementId).toBe(coffeeId);

    // value must be a composition
    expect(latest.value.isComposition).toBe(true);
    expect(latest.value.components).toBeTruthy();
    expect(latest.value.components).not.toEqual({});

    const subscriptionKeys = Object.keys(latest.value.components).sort();

    // THE CRITICAL CHECK: same component keys as /objects/value
    expect(subscriptionKeys).toEqual(canonicalKeys);

    // Each component must have VQT shape (value, quality, timestamp)
    for (const key of subscriptionKeys) {
      const vqt = latest.value.components[key];
      expect(vqt).toHaveProperty('value');
      expect(vqt).toHaveProperty('quality');
      expect(vqt).toHaveProperty('timestamp');
    }

    // Cleanup
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/delete',
      payload: {
        subscriptionIds: [subId],
        clientId: 'match-test',
      },
    });
  }, 20_000);

  // ── Error handling ───────────────────────────────────────

  it('POST /v1/subscriptions/stream returns 404 for unknown subscription', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/stream',
      payload: {
        subscriptionId: 'does-not-exist',
        clientId: 'some-client',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  // ── SUB-07 / SUB-13 conformance (sync acknowledgement) ──

  it('SUB-07: lastSequenceNumber removes acknowledged batches', async () => {
    const model = await ctx.modelService.getOrBuildModel();
    // Pick a CoffeeMachine property that changes every 200ms
    const brewTempNode = [...model.nodesById.values()].find(
      (n) => n.name.includes('Brew Temperature') && n.kind === 'property',
    );
    expect(brewTempNode).toBeDefined();
    const brewTempId = brewTempNode!.id;

    // Create subscription
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: {
        clientId: 'sub07',
        displayName: 'SUB-07 Test',
      },
    });
    const subId = createRes.json().result.subscriptionId;

    // Register monitored item
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: {
        subscriptionId: subId,
        elementIds: [brewTempId],
        maxDepth: 1,
        clientId: 'sub07',
      },
    });

    // Wait for updates to accumulate
    await new Promise((r) => setTimeout(r, 2500));

    // Sync with ack=0 — should get all accumulated updates
    const sync1 = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: subId,
        lastSequenceNumber: 0,
        clientId: 'sub07',
      },
    });
    const updates1 = sync1.json().result.flatMap((b: any) =>
      b.updates.map((u: any) => ({
        ...u,
        sequenceNumber: b.sequenceNumber,
      })),
    );
    expect(updates1.length).toBeGreaterThan(0);
    const lastSeq = updates1[updates1.length - 1].sequenceNumber;

    // Wait for more updates
    await new Promise((r) => setTimeout(r, 1500));

    // Sync acknowledging the first batch — should only get newer updates
    const sync2 = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: subId,
        lastSequenceNumber: lastSeq,
        clientId: 'sub07',
      },
    });
    const updates2 = sync2.json().result.flatMap((b: any) =>
      b.updates.map((u: any) => ({
        ...u,
        sequenceNumber: b.sequenceNumber,
      })),
    );
    // All returned updates must have sequenceNumber > lastSeq
    for (const u of updates2) {
      expect(u.sequenceNumber).toBeGreaterThan(lastSeq);
    }

    // Cleanup
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/delete',
      payload: {
        subscriptionIds: [subId],
        clientId: 'sub07',
      },
    });
  }, 15_000);

  it('SUB-13: lastSequenceNumber = -1 clears all pending updates', async () => {
    const model = await ctx.modelService.getOrBuildModel();
    const brewTempNode = [...model.nodesById.values()].find(
      (n) => n.name.includes('Brew Temperature') && n.kind === 'property',
    );
    expect(brewTempNode).toBeDefined();
    const brewTempId = brewTempNode!.id;

    // Create subscription
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      payload: {
        clientId: 'sub13',
        displayName: 'SUB-13 Test',
      },
    });
    const subId = createRes.json().result.subscriptionId;

    // Register monitored item
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/register',
      payload: {
        subscriptionId: subId,
        elementIds: [brewTempId],
        maxDepth: 1,
        clientId: 'sub13',
      },
    });

    // Wait for updates to accumulate
    await new Promise((r) => setTimeout(r, 2500));

    // Verify we have pending updates
    const sync1 = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: subId,
        lastSequenceNumber: 0,
        clientId: 'sub13',
      },
    });
    expect(sync1.json().result.flatMap((b: any) => b.updates).length).toBeGreaterThan(0);

    // Sync with lastSequenceNumber = -1 — should clear everything
    const sync2 = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: subId,
        lastSequenceNumber: -1,
        clientId: 'sub13',
      },
    });
    expect(sync2.json().result).toEqual([]);

    // Subsequent sync should also be empty (queue was drained)
    const sync3 = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/sync',
      payload: {
        subscriptionId: subId,
        lastSequenceNumber: 0,
        clientId: 'sub13',
      },
    });
    expect(sync3.json().result).toEqual([]);

    // Cleanup
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions/delete',
      payload: {
        subscriptionIds: [subId],
        clientId: 'sub13',
      },
    });
  }, 15_000);
});
