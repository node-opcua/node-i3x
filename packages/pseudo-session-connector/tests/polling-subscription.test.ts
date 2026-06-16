// ─────────────────────────────────────────────────────────────
// TDD tests for PollingMonitoredSubscription
// (polling-based: setInterval + PseudoSession.read)
// ─────────────────────────────────────────────────────────────

import { consoleLogger } from '@node-i3x/core';
import { DataType, PseudoSession, type UAVariable, Variant } from 'node-opcua';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PollingMonitoredSubscription } from '../src/polling-subscription.js';
import {
  createTestContext,
  type TestContext,
  teardownTestContext,
} from './helpers/create-test-context.js';

describe('PollingMonitoredSubscription', () => {
  let ctx: TestContext;
  let session: PseudoSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    session = new PseudoSession(ctx.addressSpace);
  });

  afterAll(async () => {
    await teardownTestContext(ctx);
  });

  it('detects a value change after a poll cycle', async () => {
    vi.useFakeTimers();
    try {
      const sub = new PollingMonitoredSubscription(session, 100, consoleLogger);
      await sub.addItems([ctx.nodeIds.temperature]);

      const received: Array<{
        nodeId: string;
        value: unknown;
      }> = [];
      sub.onDataChange((nodeId, value) => {
        received.push({ nodeId, value });
      });

      // Initial poll — captures the current value
      await vi.advanceTimersByTimeAsync(100);

      // first poll should report the initial value
      // (it's the first time seeing it)
      expect(received.length).toBeGreaterThanOrEqual(1);
      received.length = 0; // reset

      // Change the value
      const variable = ctx.addressSpace.findNode(ctx.nodeIds.temperature)! as UAVariable;
      variable.setValueFromSource(
        new Variant({ dataType: DataType.Double, value: 66.6 }),
      );

      // Next poll should detect the change
      await vi.advanceTimersByTimeAsync(100);
      expect(received).toHaveLength(1);
      expect(received[0]!.value).toBe(66.6);

      await sub.close();

      // restore
      variable.setValueFromSource(
        new Variant({ dataType: DataType.Double, value: 42.5 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fire when the value has not changed', async () => {
    vi.useFakeTimers();
    try {
      const sub = new PollingMonitoredSubscription(session, 100, consoleLogger);
      await sub.addItems([ctx.nodeIds.temperature]);

      const received: unknown[] = [];
      sub.onDataChange((_nodeId, value) => {
        received.push(value);
      });

      // Initial poll
      await vi.advanceTimersByTimeAsync(100);
      received.length = 0; // reset initial

      // Another poll without changing the value
      await vi.advanceTimersByTimeAsync(100);
      expect(received).toHaveLength(0);

      await sub.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling after close()', async () => {
    vi.useFakeTimers();
    try {
      const sub = new PollingMonitoredSubscription(session, 100, consoleLogger);
      await sub.addItems([ctx.nodeIds.temperature]);

      let callCount = 0;
      sub.onDataChange(() => {
        callCount++;
      });

      // Let initial poll happen
      await vi.advanceTimersByTimeAsync(100);
      callCount = 0;

      await sub.close();

      // Change + poll — should not fire
      const variable = ctx.addressSpace.findNode(ctx.nodeIds.temperature)! as UAVariable;
      variable.setValueFromSource(new Variant({ dataType: DataType.Double, value: 55 }));
      await vi.advanceTimersByTimeAsync(100);

      expect(callCount).toBe(0);

      // restore
      variable.setValueFromSource(
        new Variant({ dataType: DataType.Double, value: 42.5 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('removeItems silently ignores unknown nodeIds', async () => {
    vi.useFakeTimers();
    try {
      const sub = new PollingMonitoredSubscription(session, 100, consoleLogger);
      await sub.addItems([ctx.nodeIds.temperature]);

      // Remove an unknown nodeId — should not throw
      await sub.removeItems(['ns=99;s=DoesNotExist']);

      // The subscription should still be monitoring temperature
      let callCount = 0;
      sub.onDataChange(() => {
        callCount++;
      });
      await vi.advanceTimersByTimeAsync(100);
      expect(callCount).toBeGreaterThanOrEqual(1);

      await sub.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('removeItems stops polling when all items removed', async () => {
    vi.useFakeTimers();
    try {
      const sub = new PollingMonitoredSubscription(session, 100, consoleLogger);
      await sub.addItems([ctx.nodeIds.temperature]);

      let callCount = 0;
      sub.onDataChange(() => {
        callCount++;
      });

      // Let initial poll happen
      await vi.advanceTimersByTimeAsync(100);
      callCount = 0;

      // Remove all items — should stop polling
      await sub.removeItems([ctx.nodeIds.temperature]);

      // Change the value and advance — should not fire
      const variable = ctx.addressSpace.findNode(ctx.nodeIds.temperature)! as UAVariable;
      variable.setValueFromSource(new Variant({ dataType: DataType.Double, value: 77 }));
      await vi.advanceTimersByTimeAsync(100);
      expect(callCount).toBe(0);

      await sub.close();
      variable.setValueFromSource(
        new Variant({ dataType: DataType.Double, value: 42.5 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles poll errors gracefully', async () => {
    vi.useFakeTimers();
    try {
      // Create a session mock that throws on read
      const failSession = {
        read: vi.fn().mockRejectedValue(new Error('read failure')),
      } as unknown as PseudoSession;

      const sub = new PollingMonitoredSubscription(failSession, 100, consoleLogger);
      await sub.addItems([ctx.nodeIds.temperature]);

      let callCount = 0;
      sub.onDataChange(() => {
        callCount++;
      });

      // Poll should fail but not throw
      await vi.advanceTimersByTimeAsync(100);
      expect(callCount).toBe(0);

      await sub.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
