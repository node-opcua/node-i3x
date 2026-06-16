// ─────────────────────────────────────────────────────────────
// Unit tests for coerceToDataType / inferDataType
// ─────────────────────────────────────────────────────────────

import { DataType } from 'node-opcua';
import { describe, expect, it } from 'vitest';
import { coerceToDataType, inferDataType } from '../src/data-type-coercer.js';

describe('coerceToDataType', () => {
  // ── Boolean coercion ──────────────────────────────────────

  describe('Boolean', () => {
    it('passes through boolean true', () => {
      expect(coerceToDataType(true, DataType.Boolean)).toBe(true);
    });

    it('passes through boolean false', () => {
      expect(coerceToDataType(false, DataType.Boolean)).toBe(false);
    });

    it('coerces string "true" to true', () => {
      expect(coerceToDataType('true', DataType.Boolean)).toBe(true);
    });

    it('coerces string "TRUE" to true (case-insensitive)', () => {
      expect(coerceToDataType('TRUE', DataType.Boolean)).toBe(true);
    });

    it('coerces string "false" to false', () => {
      expect(coerceToDataType('false', DataType.Boolean)).toBe(false);
    });

    it('coerces string "1" to true', () => {
      expect(coerceToDataType('1', DataType.Boolean)).toBe(true);
    });

    it('coerces string "0" to false', () => {
      expect(coerceToDataType('0', DataType.Boolean)).toBe(false);
    });

    it('coerces number 1 to true', () => {
      expect(coerceToDataType(1, DataType.Boolean)).toBe(true);
    });

    it('coerces number 0 to false', () => {
      expect(coerceToDataType(0, DataType.Boolean)).toBe(false);
    });

    it('coerces non-zero number to true', () => {
      expect(coerceToDataType(42, DataType.Boolean)).toBe(true);
    });
  });

  // ── Numeric types ─────────────────────────────────────────

  describe('integer types', () => {
    it('coerces string to Int16', () => {
      expect(coerceToDataType('42', DataType.Int16)).toBe(42);
    });

    it('truncates float for Int16', () => {
      expect(coerceToDataType('42.9', DataType.Int16)).toBe(42);
    });

    it('coerces string to UInt32', () => {
      expect(coerceToDataType('100000', DataType.UInt32)).toBe(100000);
    });

    it('coerces number to Int32', () => {
      expect(coerceToDataType(99.5, DataType.Int32)).toBe(99);
    });

    it('coerces string to SByte', () => {
      expect(coerceToDataType('-5', DataType.SByte)).toBe(-5);
    });

    it('coerces string to Byte', () => {
      expect(coerceToDataType('255', DataType.Byte)).toBe(255);
    });

    it('coerces string to UInt16', () => {
      expect(coerceToDataType('65535', DataType.UInt16)).toBe(65535);
    });
  });

  describe('64-bit integer types', () => {
    it('coerces number to Int64 [high, low] pair', () => {
      const result = coerceToDataType(42, DataType.Int64);
      expect(result).toEqual([0, 42]);
    });

    it('passes through array value for UInt64', () => {
      const result = coerceToDataType([1, 500], DataType.UInt64);
      expect(result).toEqual([1, 500]);
    });

    it('coerces string to Int64 [high, low] pair', () => {
      const result = coerceToDataType('100', DataType.Int64);
      expect(result).toEqual([0, 100]);
    });
  });

  describe('floating point types', () => {
    it('coerces string to Float', () => {
      expect(coerceToDataType('3.14', DataType.Float)).toBeCloseTo(3.14);
    });

    it('coerces string to Double', () => {
      expect(coerceToDataType('2.718281828', DataType.Double)).toBeCloseTo(2.718281828);
    });

    it('coerces integer string to Double', () => {
      expect(coerceToDataType('42', DataType.Double)).toBe(42);
    });

    it('passes through number for Float', () => {
      expect(coerceToDataType(1.5, DataType.Float)).toBe(1.5);
    });
  });

  // ── String ────────────────────────────────────────────────

  describe('String', () => {
    it('passes through string value', () => {
      expect(coerceToDataType('hello', DataType.String)).toBe('hello');
    });

    it('coerces number to string', () => {
      expect(coerceToDataType(42, DataType.String)).toBe('42');
    });

    it('coerces boolean to string', () => {
      expect(coerceToDataType(true, DataType.String)).toBe('true');
    });
  });

  // ── null / undefined input ────────────────────────────────

  describe('null and undefined input', () => {
    it('coerces null to false for Boolean', () => {
      expect(coerceToDataType(null, DataType.Boolean)).toBe(false);
    });

    it('coerces undefined to false for Boolean', () => {
      expect(coerceToDataType(undefined, DataType.Boolean)).toBe(false);
    });

    it('coerces null to 0 for Int32', () => {
      expect(coerceToDataType(null, DataType.Int32)).toBe(0);
    });

    it('coerces undefined to NaN for Double', () => {
      expect(coerceToDataType(undefined, DataType.Double)).toBeNaN();
    });

    it('coerces null to "null" for String', () => {
      expect(coerceToDataType(null, DataType.String)).toBe('null');
    });

    it('coerces undefined to "undefined" for String', () => {
      expect(coerceToDataType(undefined, DataType.String)).toBe('undefined');
    });
  });

  // ── Unknown DataType (passthrough) ────────────────────────

  describe('unknown / default DataType', () => {
    it('passes through value for DataType.Null', () => {
      const obj = { foo: 'bar' };
      expect(coerceToDataType(obj, DataType.Null)).toBe(obj);
    });

    it('passes through string for unknown DataType', () => {
      expect(coerceToDataType('hello', DataType.Null)).toBe('hello');
    });

    it('passes through number for unknown DataType', () => {
      expect(coerceToDataType(42, DataType.Null)).toBe(42);
    });
  });

  // ── DateTime ──────────────────────────────────────────────

  describe('DateTime', () => {
    it('passes through Date objects', () => {
      const d = new Date('2024-01-01');
      expect(coerceToDataType(d, DataType.DateTime)).toBe(d);
    });

    it('coerces ISO string to Date', () => {
      const result = coerceToDataType('2024-01-01T00:00:00Z', DataType.DateTime);
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).toISOString()).toBe('2024-01-01T00:00:00.000Z');
    });

    it('coerces epoch number to Date', () => {
      const epoch = 1704067200000; // 2024-01-01
      const result = coerceToDataType(epoch, DataType.DateTime);
      expect(result).toBeInstanceOf(Date);
    });
  });

  // ── ByteString ────────────────────────────────────────────

  describe('ByteString', () => {
    it('passes through Buffer', () => {
      const buf = Buffer.from('hello');
      expect(coerceToDataType(buf, DataType.ByteString)).toBe(buf);
    });

    it('decodes base64 string to Buffer', () => {
      const result = coerceToDataType('aGVsbG8=', DataType.ByteString);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect((result as Buffer).toString()).toBe('hello');
    });
  });
});

describe('inferDataType', () => {
  it('infers Double for number', () => {
    expect(inferDataType(42)).toBe(DataType.Double);
  });

  it('infers Boolean for boolean', () => {
    expect(inferDataType(true)).toBe(DataType.Boolean);
  });

  it('infers String for string', () => {
    expect(inferDataType('hello')).toBe(DataType.String);
  });

  it('infers DateTime for Date', () => {
    expect(inferDataType(new Date())).toBe(DataType.DateTime);
  });

  it('infers Null for null', () => {
    expect(inferDataType(null)).toBe(DataType.Null);
  });

  it('infers Null for undefined', () => {
    expect(inferDataType(undefined)).toBe(DataType.Null);
  });

  it('infers Null for object', () => {
    expect(inferDataType({ foo: 'bar' })).toBe(DataType.Null);
  });
});
