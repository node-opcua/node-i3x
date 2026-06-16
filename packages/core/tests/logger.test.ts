// ─────────────────────────────────────────────────────────────
// @node-i3x/core — logger port unit tests
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { nullLogger } from '../src/ports/logger.js';

describe('nullLogger', () => {
  it('debug is callable and returns undefined', () => {
    expect(nullLogger.debug('test')).toBeUndefined();
  });

  it('info is callable and returns undefined', () => {
    expect(nullLogger.info('test')).toBeUndefined();
  });

  it('warn is callable and returns undefined', () => {
    expect(nullLogger.warn('test warning')).toBeUndefined();
  });

  it('error is callable and returns undefined', () => {
    expect(nullLogger.error('test error')).toBeUndefined();
  });

  it('all methods accept variadic arguments', () => {
    expect(() => {
      nullLogger.debug('msg', { a: 1 }, 'extra');
      nullLogger.info('msg', 42);
      nullLogger.warn('msg', new Error('test'));
      nullLogger.error('msg', 'arg1', 'arg2');
    }).not.toThrow();
  });
});
