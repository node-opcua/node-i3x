// ─────────────────────────────────────────────────────────────
// @node-i3x/core — subscription-streams unit tests
// ─────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionUpdate } from '../src/domain/subscription.js';
import type { StreamableSubState } from '../src/services/subscription-streams.js';
import {
  clearActiveStream,
  notifyWaiters,
  registerActiveStream,
  waitForUpdates,
} from '../src/services/subscription-streams.js';

function makeSub(overrides: Partial<StreamableSubState> = {}): StreamableSubState {
  return {
    waiters: [],
    activeStreamClose: null,
    updates: [],
    ...overrides,
  };
}

function makeUpdate(seq: number): SubscriptionUpdate {
  return {
    sequenceNumber: seq,
    elementId: 'elem-1',
    value: { isComposition: false, value: seq, quality: 'Good', timestamp: '' },
    quality: 'Good',
    timestamp: new Date().toISOString(),
  };
}

describe('subscription-streams', () => {
  // ── waitForUpdates ─────────────────────────────────────────

  describe('waitForUpdates', () => {
    it('returns immediately when matching updates exist', async () => {
      const sub = makeSub({ updates: [makeUpdate(1), makeUpdate(2), makeUpdate(3)] });
      const result = await waitForUpdates(sub, 1, 5000);
      expect(result).toHaveLength(2);
      expect(result[0]!.sequenceNumber).toBe(2);
      expect(result[1]!.sequenceNumber).toBe(3);
    });

    it('returns empty array on timeout when no updates arrive', async () => {
      const sub = makeSub();
      const start = Date.now();
      const result = await waitForUpdates(sub, 0, 50);
      const elapsed = Date.now() - start;
      expect(result).toHaveLength(0);
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('removes waiter from list after timeout', async () => {
      const sub = makeSub();
      expect(sub.waiters).toHaveLength(0);
      await waitForUpdates(sub, 0, 50);
      // After timeout settles, the waiter should have been removed
      expect(sub.waiters).toHaveLength(0);
    });

    it('resolves when notifyWaiters is called before timeout', async () => {
      const sub = makeSub();
      const promise = waitForUpdates(sub, 0, 5000);

      // Waiter should be registered
      expect(sub.waiters).toHaveLength(1);

      const update = makeUpdate(1);
      notifyWaiters(sub, update);

      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0]!.sequenceNumber).toBe(1);
      // Waiter should be cleaned up
      expect(sub.waiters).toHaveLength(0);
    });

    it('settle is idempotent — second call is ignored', async () => {
      const sub = makeSub();
      const promise = waitForUpdates(sub, 0, 100);

      // Resolve via notify
      const update = makeUpdate(1);
      notifyWaiters(sub, update);

      // Then let timeout fire as well — should be a no-op
      const result = await promise;
      expect(result).toHaveLength(1);
    });
  });

  // ── registerActiveStream ───────────────────────────────────

  describe('registerActiveStream', () => {
    it('sets activeStreamClose callback', () => {
      const sub = makeSub();
      const close = vi.fn();
      registerActiveStream(sub, close);
      expect(sub.activeStreamClose).toBe(close);
    });

    it('closes previous stream when registering a new one', () => {
      const sub = makeSub();
      const close1 = vi.fn();
      const close2 = vi.fn();

      registerActiveStream(sub, close1);
      expect(sub.activeStreamClose).toBe(close1);

      registerActiveStream(sub, close2);
      expect(close1).toHaveBeenCalledOnce();
      expect(sub.activeStreamClose).toBe(close2);
    });

    it('wakes blocked waiters when replacing a stream', async () => {
      const sub = makeSub();
      const close1 = vi.fn();
      registerActiveStream(sub, close1);

      // Add a waiter that simulates a blocked long-poll
      const waiterPromise = waitForUpdates(sub, 0, 30_000);
      expect(sub.waiters).toHaveLength(1);

      // Replace stream — should resolve the waiter with []
      const close2 = vi.fn();
      registerActiveStream(sub, close2);

      const result = await waiterPromise;
      expect(result).toHaveLength(0);
      expect(sub.waiters).toHaveLength(0);
      expect(close1).toHaveBeenCalledOnce();
    });
  });

  // ── clearActiveStream ──────────────────────────────────────

  describe('clearActiveStream', () => {
    it('clears if callback matches', () => {
      const sub = makeSub();
      const close = vi.fn();
      registerActiveStream(sub, close);
      expect(sub.activeStreamClose).toBe(close);

      clearActiveStream(sub, close);
      expect(sub.activeStreamClose).toBeNull();
    });

    it('does NOT clear if callback does not match (stale clear)', () => {
      const sub = makeSub();
      const close1 = vi.fn();
      const close2 = vi.fn();
      registerActiveStream(sub, close1);

      clearActiveStream(sub, close2);
      expect(sub.activeStreamClose).toBe(close1);
    });
  });

  // ── notifyWaiters ──────────────────────────────────────────

  describe('notifyWaiters', () => {
    it('resolves all waiters and empties the list', () => {
      const sub = makeSub();
      const results: SubscriptionUpdate[][] = [];
      sub.waiters.push((u) => results.push(u));
      sub.waiters.push((u) => results.push(u));

      const update = makeUpdate(5);
      notifyWaiters(sub, update);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual([update]);
      expect(results[1]).toEqual([update]);
      expect(sub.waiters).toHaveLength(0);
    });

    it('is a no-op when there are no waiters', () => {
      const sub = makeSub();
      expect(() => notifyWaiters(sub, makeUpdate(1))).not.toThrow();
    });
  });
});
