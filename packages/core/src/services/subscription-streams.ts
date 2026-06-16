// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  Subscription stream management
//
// Active SSE stream tracking and long-poll waiter logic,
// extracted from SubscriptionService for separation of concerns.
// ─────────────────────────────────────────────────────────────

import type { SubscriptionUpdate } from '../domain/subscription.js';

/**
 * Minimal interface for the subscription state fields
 * required by stream management functions.
 */
export interface StreamableSubState {
  /** Waiters for the stream / long-poll endpoint. */
  waiters: Array<(updates: SubscriptionUpdate[]) => void>;
  /** Callback to close the currently active SSE stream (if any). */
  activeStreamClose: (() => void) | null;
  /** The update queue. */
  updates: SubscriptionUpdate[];
}

/**
 * Register an active SSE stream for the subscription.
 * If another stream is already active, it is closed first
 * (enforcing single-stream-per-subscription).
 */
export function registerActiveStream(
  sub: StreamableSubState,
  closeCallback: () => void,
): void {
  if (sub.activeStreamClose) {
    // Close the previous stream
    sub.activeStreamClose();
    // Wake up any blocked waitForUpdates so the old loop exits now
    for (const w of sub.waiters) w([]);
    sub.waiters = [];
  }
  sub.activeStreamClose = closeCallback;
}

/**
 * Clear the active stream reference when a stream closes.
 * Only clears if the callback matches (prevents stale clears).
 */
export function clearActiveStream(
  sub: StreamableSubState,
  closeCallback: () => void,
): void {
  if (sub.activeStreamClose === closeCallback) {
    sub.activeStreamClose = null;
  }
}

/**
 * Wait for new subscription updates after the given sequence number.
 * Returns immediately if matching updates are already queued;
 * otherwise blocks (via a promise) until new data arrives or the
 * timeout expires.
 *
 * @param sub            The subscription state.
 * @param afterSequence  Only return updates with sequenceNumber > this.
 * @param timeoutMs      Maximum wait time in milliseconds.
 */
export function waitForUpdates(
  sub: StreamableSubState,
  afterSequence: number,
  timeoutMs: number = 30_000,
): Promise<SubscriptionUpdate[]> {
  const pending = sub.updates.filter((u) => u.sequenceNumber > afterSequence);
  if (pending.length > 0) return Promise.resolve(pending);

  return new Promise<SubscriptionUpdate[]>((resolve) => {
    let settled = false;

    const settle = (updates: SubscriptionUpdate[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.waiters = sub.waiters.filter((w) => w !== settle);
      resolve(updates);
    };

    const timer = setTimeout(() => settle([]), timeoutMs);
    sub.waiters.push(settle);
  });
}

/**
 * Notify all long-poll / stream waiters that a new update is available.
 */
export function notifyWaiters(sub: StreamableSubState, update: SubscriptionUpdate): void {
  const waiters = sub.waiters;
  sub.waiters = [];
  for (const resolve of waiters) {
    resolve([update]);
  }
}
