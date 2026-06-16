// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — DataType coercion helpers
// ─────────────────────────────────────────────────────────────

import { DataType } from 'node-opcua';

/**
 * Coerce a JSON value to the expected OPC UA DataType.
 * Handles the common built-in types (1..25).
 */
export function coerceToDataType(value: unknown, dt: DataType): unknown {
  switch (dt) {
    // Boolean (1)
    case DataType.Boolean:
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string')
        return value.toLowerCase() === 'true' || value === '1';
      return Boolean(value);

    // Integer types (2-9)
    case DataType.SByte:
    case DataType.Byte:
    case DataType.Int16:
    case DataType.UInt16:
    case DataType.Int32:
    case DataType.UInt32:
      return Math.trunc(Number(value));

    case DataType.Int64:
    case DataType.UInt64:
      // node-opcua uses [high, low] arrays for 64-bit integers
      if (Array.isArray(value)) return value;
      return [0, Math.trunc(Number(value))];

    // Floating point (10-11)
    case DataType.Float:
    case DataType.Double:
      return Number(value);

    // String (12)
    case DataType.String:
      return String(value);

    // DateTime (13)
    case DataType.DateTime:
      if (value instanceof Date) return value;
      if (typeof value === 'string' || typeof value === 'number') {
        return new Date(value);
      }
      return value;

    // ByteString (15)
    case DataType.ByteString:
      if (Buffer.isBuffer(value)) return value;
      if (typeof value === 'string') return Buffer.from(value, 'base64');
      return value;
    default:
      return value;
  }
}

/** Fallback: infer DataType from JS value when server type is unknown. */
export function inferDataType(value: unknown): DataType {
  if (typeof value === 'number') return DataType.Double;
  if (typeof value === 'boolean') return DataType.Boolean;
  if (typeof value === 'string') return DataType.String;
  if (value instanceof Date) return DataType.DateTime;
  return DataType.Null;
}
