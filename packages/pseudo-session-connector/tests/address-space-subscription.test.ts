// ─────────────────────────────────────────────────────────────
// TDD tests for AddressSpaceMonitoredSubscription
// (event-based: UAVariable.on("value_changed"))
// ─────────────────────────────────────────────────────────────

import { consoleLogger } from '@node-i3x/core';
import { DataType, type UAVariable, Variant } from 'node-opcua';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AddressSpaceMonitoredSubscription } from '../src/address-space-subscription.js';
import {
  createTestContext,
  type TestContext,
  teardownTestContext,
} from './helpers/create-test-context.js';

describe('AddressSpaceMonitoredSubscription', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await teardownTestContext(ctx);
  });

  /** Helper: mutate a variable in the address space */
  function setTemp(value: number): void {
    const v = ctx.addressSpace.findNode(ctx.nodeIds.temperature)! as UAVariable;
    v.setValueFromSource(new Variant({ dataType: DataType.Double, value }));
  }

  it(
    'fires callback on value change and monitors multiple ' + 'variables independently',
    async () => {
      const sub = new AddressSpaceMonitoredSubscription(ctx.addressSpace, consoleLogger);
      await sub.addItems([ctx.nodeIds.temperature, ctx.nodeIds.pressure]);

      const received: Array<{
        nodeId: string;
        value: unknown;
      }> = [];
      sub.onDataChange((nodeId, value) => {
        received.push({ nodeId, value });
      });

      // Mutate both
      setTemp(77.7);
      const pressVar = ctx.addressSpace.findNode(ctx.nodeIds.pressure)! as UAVariable;
      pressVar.setValueFromSource(new Variant({ dataType: DataType.Double, value: 20 }));

      expect(received).toHaveLength(2);
      expect(received.map((r) => r.nodeId)).toContain(ctx.nodeIds.temperature);
      expect(received.map((r) => r.nodeId)).toContain(ctx.nodeIds.pressure);

      await sub.close();
      setTemp(42.5);
      pressVar.setValueFromSource(
        new Variant({
          dataType: DataType.Double,
          value: 101.3,
        }),
      );
    },
  );

  it('stops firing after removeItems() and after close()', async () => {
    const sub = new AddressSpaceMonitoredSubscription(ctx.addressSpace, consoleLogger);
    await sub.addItems([ctx.nodeIds.temperature]);

    let callCount = 0;
    sub.onDataChange(() => {
      callCount++;
    });

    // removeItems stops the listener
    await sub.removeItems([ctx.nodeIds.temperature]);
    setTemp(55.5);
    expect(callCount).toBe(0);

    // Re-add, then close() should also stop it
    await sub.addItems([ctx.nodeIds.temperature]);
    await sub.close();
    callCount = 0;
    setTemp(66.6);
    expect(callCount).toBe(0);

    setTemp(42.5); // restore
  });

  it('does not duplicate listeners on repeated addItems()', async () => {
    const sub = new AddressSpaceMonitoredSubscription(ctx.addressSpace, consoleLogger);
    await sub.addItems([ctx.nodeIds.temperature]);
    await sub.addItems([ctx.nodeIds.temperature]); // dup

    let callCount = 0;
    sub.onDataChange(() => {
      callCount++;
    });
    setTemp(88);
    expect(callCount).toBe(1); // not 2

    await sub.close();
    setTemp(42.5); // restore
  });
});
