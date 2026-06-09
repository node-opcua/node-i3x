// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  Subscription aggregate
// ─────────────────────────────────────────────────────────────

import type { CurrentValueResult, VQT } from './vqt.js';

/**
 * A single subscription update in the update queue.
 *
 * The `value` field carries the full composite structure
 * matching the i3X CurrentValueResult shape — so the
 * explorer sees the same format from stream as from
 * POST /objects/value.
 */
export interface SubscriptionUpdate {
  readonly sequenceNumber: number;
  /** The registered asset / object elementId. */
  readonly elementId: string;
  /** The composite value snapshot. */
  readonly value: CurrentValueResult;
  readonly quality: string;
  /** RFC 3339 UTC timestamp. */
  readonly timestamp: string;
}

/** Result of a sync operation — pending updates for the client. */
export interface SubscriptionSyncResult {
  readonly updates: readonly SubscriptionUpdate[];
}

/** Result of a delete operation — per-subscription success/failure. */
export interface SubscriptionDeleteResult {
  readonly success: boolean;
  readonly subscriptionId: string;
  readonly error?: { readonly code: number; readonly message: string } | null;
}

/** Public view of a subscription's current state. */
export interface SubscriptionDetail {
  readonly subscriptionId: string;
  readonly clientId: string | null;
  readonly displayName: string | null;
  readonly monitoredObjects: readonly MonitoredObjectEntry[];
  readonly mode: string;
}

export interface MonitoredObjectEntry {
  readonly elementId: string;
  readonly maxDepth: number;
}

/** Options for creating a new subscription. */
export interface CreateSubscriptionOptions {
  readonly clientId?: string | null;
  readonly displayName?: string | null;
}
