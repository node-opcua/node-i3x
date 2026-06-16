// ─────────────────────────────────────────────────────────────
// TDD tests for PseudoSessionDataSourceAdapter.createMonitoredSubscription()
// ─────────────────────────────────────────────────────────────

import { consoleLogger } from '@node-i3x/core';
import { DataType, type UAVariable, Variant } from 'node-opcua';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PseudoSessionDataSourceAdapter } from '../src/pseudo-session-adapter.js';
import {
  createTestContext,
  type TestContext,
  teardownTestContext,
} from './helpers/create-test-context.js';

describe('PseudoSessionDataSourceAdapter.createMonitoredSubscription', () => {
  let ctx: TestContext;
  let adapter: PseudoSessionDataSourceAdapter;

  beforeAll(async () => {
    ctx = await createTestContext();
    adapter = new PseudoSessionDataSourceAdapter(ctx.addressSpace, consoleLogger);
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter.disconnect();
    await teardownTestContext(ctx);
  });

  /** Helper: mutate a variable in the address space */
  function setVariable(nodeId: string, value: number): void {
    const v = ctx.addressSpace.findNode(nodeId)! as UAVariable;
    v.setValueFromSource(new Variant({ dataType: DataType.Double, value }));
  }

  it('returns a subscription with addItems, removeItems, close methods', async () => {
    const sub = await adapter.createMonitoredSubscription({
      publishingIntervalMs: 100,
      samplingIntervalMs: 100,
    });

    expect(sub).toBeDefined();
    expect(sub.id).toBeTruthy();
    expect(typeof sub.addItems).toBe('function');
    expect(typeof sub.removeItems).toBe('function');
    expect(typeof sub.close).toBe('function');
    expect(typeof sub.onDataChange).toBe('function');

    await sub.close();
  });

  it('addItems triggers onData callback when values change', async () => {
    const sub = await adapter.createMonitoredSubscription({
      publishingIntervalMs: 100,
      samplingIntervalMs: 100,
    });

    await sub.addItems([ctx.nodeIds.temperature, ctx.nodeIds.pressure]);

    const received: Array<{
      nodeId: string;
      value: unknown;
    }> = [];
    sub.onDataChange((nodeId, value) => {
      received.push({ nodeId, value });
    });

    // Mutate the temperature variable
    setVariable(ctx.nodeIds.temperature, 77.7);

    expect(received.length).toBeGreaterThanOrEqual(1);
    const tempChange = received.find((r) => r.nodeId === ctx.nodeIds.temperature);
    expect(tempChange).toBeDefined();
    expect(tempChange!.value).toBe(77.7);

    await sub.close();
    // restore
    setVariable(ctx.nodeIds.temperature, 42.5);
  });

  it('close() stops notifications', async () => {
    const sub = await adapter.createMonitoredSubscription({
      publishingIntervalMs: 100,
      samplingIntervalMs: 100,
    });

    await sub.addItems([ctx.nodeIds.temperature]);

    let callCount = 0;
    sub.onDataChange(() => {
      callCount++;
    });

    // Close the subscription
    await sub.close();
    callCount = 0;

    // Change the value after close — should not fire
    setVariable(ctx.nodeIds.temperature, 55.5);
    expect(callCount).toBe(0);

    // restore
    setVariable(ctx.nodeIds.temperature, 42.5);
  });
});
