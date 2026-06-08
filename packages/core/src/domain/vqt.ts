// ─────────────────────────────────────────────────────────────
// @i3x/core  —  VQT value object
// ─────────────────────────────────────────────────────────────

import type { DataQuality } from './model-node.js';

/** Value / Quality / Timestamp — the universal data-exchange atom. */
export interface VQT {
  readonly value: unknown;
  readonly quality: DataQuality;
  /** RFC 3339 UTC timestamp. */
  readonly timestamp: string;
}

/** A VQT with additional composition information. */
export interface CurrentValueResult {
  readonly isComposition: boolean;
  readonly value: unknown;
  readonly quality: DataQuality;
  readonly timestamp: string;
  readonly components?: Readonly<Record<string, VQT>> | null;
}

/** Historical values for a single element. */
export interface HistoricalValueResult {
  readonly isComposition: boolean;
  readonly values: readonly VQT[];
}
