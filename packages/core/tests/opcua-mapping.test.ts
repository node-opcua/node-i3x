// ─────────────────────────────────────────────────────────────
// @node-i3x/core — opcua-mapping helper unit tests
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  dataValueToHistorical,
  dataValueToSource,
  NODE_CLASS_NAMES,
  qualifiedNameToNsu,
} from '../src/helpers/opcua-mapping.js';

describe('qualifiedNameToNsu', () => {
  const namespaces = ['http://opcfoundation.org/UA/', 'http://example.com/'];

  it('returns nsu=<uri>:<name> for valid input', () => {
    const result = qualifiedNameToNsu(
      { namespaceIndex: 1, name: 'Temperature' },
      namespaces,
    );
    expect(result).toBe('nsu=http://example.com/:Temperature');
  });

  it('uses namespace index 0 by default', () => {
    const result = qualifiedNameToNsu({ name: 'Server' }, namespaces);
    expect(result).toBe('nsu=http://opcfoundation.org/UA/:Server');
  });

  it('returns empty string for null browseName', () => {
    expect(qualifiedNameToNsu(null, namespaces)).toBe('');
  });

  it('returns empty string for undefined browseName', () => {
    expect(qualifiedNameToNsu(undefined, namespaces)).toBe('');
  });

  it('returns empty string when name is null', () => {
    expect(qualifiedNameToNsu({ namespaceIndex: 0, name: null }, namespaces)).toBe('');
  });

  it('returns empty string when name is empty', () => {
    expect(qualifiedNameToNsu({ namespaceIndex: 0, name: '' }, namespaces)).toBe('');
  });

  it('falls back to ns=<idx> when namespace index is out of range', () => {
    const result = qualifiedNameToNsu(
      { namespaceIndex: 99, name: 'OutOfRange' },
      namespaces,
    );
    expect(result).toBe('nsu=ns=99:OutOfRange');
  });
});

describe('dataValueToSource', () => {
  it('converts a good DataValue', () => {
    const ts = new Date('2024-01-01T00:00:00Z');
    const result = dataValueToSource({
      statusCode: { value: 0 },
      value: { value: 42 },
      sourceTimestamp: ts,
      serverTimestamp: null,
    });
    expect(result.value).toBe(42);
    expect(result.quality).toBe('Good');
    expect(result.timestamp).toBe(ts.toISOString());
    expect(result.statusCode).toBe(0);
  });

  it('marks non-zero status code as Bad', () => {
    const result = dataValueToSource({
      statusCode: { value: 0x80000000 },
      value: { value: null },
      sourceTimestamp: null,
      serverTimestamp: null,
    });
    expect(result.quality).toBe('Bad');
  });

  it('uses serverTimestamp when sourceTimestamp is null', () => {
    const serverTs = new Date('2024-06-01T12:00:00Z');
    const result = dataValueToSource({
      statusCode: { value: 0 },
      value: { value: 1 },
      sourceTimestamp: null,
      serverTimestamp: serverTs,
    });
    expect(result.timestamp).toBe(serverTs.toISOString());
  });

  it('uses current time when both timestamps are null', () => {
    const before = new Date().toISOString();
    const result = dataValueToSource({
      statusCode: { value: 0 },
      value: { value: 1 },
      sourceTimestamp: null,
      serverTimestamp: null,
    });
    // Timestamp should be close to now
    expect(result.timestamp).toBeTruthy();
    expect(result.timestamp >= before).toBe(true);
  });

  it('returns null value when value wrapper is null', () => {
    const result = dataValueToSource({
      statusCode: { value: 0 },
      value: null,
      sourceTimestamp: null,
      serverTimestamp: null,
    });
    expect(result.value).toBeNull();
  });

  it('returns Bad when statusCode is null', () => {
    const result = dataValueToSource({
      statusCode: null,
      value: { value: 'hello' },
      sourceTimestamp: null,
      serverTimestamp: null,
    });
    expect(result.quality).toBe('Bad');
  });
});

describe('dataValueToHistorical', () => {
  it('converts a good historical DataValue', () => {
    const ts = new Date('2024-01-01T00:00:00Z');
    const result = dataValueToHistorical({
      statusCode: { value: 0 },
      value: { value: 100 },
      sourceTimestamp: ts,
      serverTimestamp: null,
    });
    expect(result.value).toBe(100);
    expect(result.quality).toBe('Good');
    expect(result.timestamp).toBe(ts.toISOString());
    // SourceHistoricalValue does NOT have statusCode
    expect((result as Record<string, unknown>).statusCode).toBeUndefined();
  });

  it('marks bad historical value', () => {
    const result = dataValueToHistorical({
      statusCode: { value: 1 },
      value: { value: null },
      sourceTimestamp: null,
      serverTimestamp: null,
    });
    expect(result.quality).toBe('Bad');
  });
});

describe('NODE_CLASS_NAMES', () => {
  it('maps common NodeClass values', () => {
    expect(NODE_CLASS_NAMES[1]).toBe('Object');
    expect(NODE_CLASS_NAMES[2]).toBe('Variable');
    expect(NODE_CLASS_NAMES[4]).toBe('Method');
    expect(NODE_CLASS_NAMES[8]).toBe('ObjectType');
  });
});
