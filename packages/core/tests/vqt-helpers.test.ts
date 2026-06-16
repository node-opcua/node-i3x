// ─────────────────────────────────────────────────────────────
// @node-i3x/core — vqt-helpers unit tests
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { normalizeVqt } from '../src/helpers/vqt-helpers.js';

describe('normalizeVqt', () => {
  it('returns value and quality as-is when quality is Good', () => {
    const result = normalizeVqt(42, 'Good');
    expect(result.value).toBe(42);
    expect(result.quality).toBe('Good');
  });

  it('forces value to null when quality is Bad', () => {
    const result = normalizeVqt(42, 'Bad');
    expect(result.value).toBeNull();
    expect(result.quality).toBe('Bad');
  });

  it('sets quality to GoodNoData when value is null', () => {
    const result = normalizeVqt(null, 'Good');
    expect(result.value).toBeNull();
    expect(result.quality).toBe('GoodNoData');
  });

  it('sets quality to GoodNoData when value is undefined', () => {
    const result = normalizeVqt(undefined, 'Good');
    expect(result.value).toBeUndefined();
    expect(result.quality).toBe('GoodNoData');
  });

  it('Bad quality takes precedence over null value', () => {
    // When quality is Bad, value becomes null (line 20),
    // and we do NOT then re-set quality to GoodNoData
    const result = normalizeVqt(null, 'Bad');
    expect(result.value).toBeNull();
    expect(result.quality).toBe('Bad');
  });

  it('passes through non-standard quality strings', () => {
    const result = normalizeVqt('hello', 'Uncertain');
    expect(result.value).toBe('hello');
    expect(result.quality).toBe('Uncertain');
  });
});
