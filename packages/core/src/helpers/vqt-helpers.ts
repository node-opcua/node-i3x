// ─────────────────────────────────────────────────────────────
// @node-i3x/core — Quality-mapping helper
// ─────────────────────────────────────────────────────────────

import type { DataQuality } from '../domain/model-node.js';

/**
 * Normalize a value and quality code according to the i3X specification:
 * - If quality is 'Bad', value MUST be null.
 * - If value is null or undefined (and quality is not Bad), quality MUST be 'GoodNoData'.
 */
export function normalizeVqt(
  value: unknown,
  quality: string,
): { value: unknown; quality: DataQuality } {
  let val = value;
  let qual = quality as DataQuality;

  if (qual === 'Bad') {
    val = null;
  } else if (val === null || val === undefined) {
    qual = 'GoodNoData';
  }

  return { value: val, quality: qual };
}
