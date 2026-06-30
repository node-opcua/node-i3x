// ─────────────────────────────────────────────────────────────
// @node-i3x/core — OPC UA structural mapping helpers
// ─────────────────────────────────────────────────────────────

import type { SourceDataValue, SourceHistoricalValue } from '../ports/data-source.js';

export const NODE_CLASS_NAMES: Record<number, string> = {
  1: 'Object', // NodeClass.Object
  2: 'Variable', // NodeClass.Variable
  4: 'Method', // NodeClass.Method
  8: 'ObjectType', // NodeClass.ObjectType
  16: 'VariableType', // NodeClass.VariableType
  32: 'ReferenceType', // NodeClass.ReferenceType
  64: 'DataType', // NodeClass.DataType
  128: 'View', // NodeClass.View
};

/** Convert a QualifiedName-like object to its namespace-URI-qualified form. */
export function qualifiedNameToNsu(
  browseName: { namespaceIndex?: number; name?: string | null } | null | undefined,
  namespaceArray: readonly string[],
): string {
  if (!browseName?.name) return '';
  const nsIdx = browseName.namespaceIndex ?? 0;
  const nsUri = namespaceArray[nsIdx] ?? `ns=${nsIdx}`;
  return `nsu=${nsUri}:${browseName.name}`;
}

/** Convert an index-based NodeId string (e.g. "ns=17;i=1008") to its namespace-URI-qualified (nsu) form. */
export function toNsuNodeId(
  nodeIdStr: string,
  namespaceArray: readonly string[],
): string {
  if (!nodeIdStr) return '';
  if (nodeIdStr.startsWith('nsu=')) return nodeIdStr;

  let nsIdx = 0;
  let rest = nodeIdStr;

  const nsMatch = nodeIdStr.match(/^ns=(\d+);(.+)$/);
  if (nsMatch) {
    nsIdx = parseInt(nsMatch[1]!, 10);
    rest = nsMatch[2]!;
  }

  const nsUri = namespaceArray[nsIdx] ?? `ns=${nsIdx}`;
  return `nsu=${nsUri};${rest}`;
}

/** Convert a value from node-opcua to a JSON-compatible type. */
export function cleanOpcuaValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return null;
  }

  if (typeof val === 'bigint') {
    return Number(val);
  }

  // Handle TypedArrays (Float64Array, etc.) and Buffers
  if (ArrayBuffer.isView(val) && !(val instanceof DataView)) {
    if (Buffer.isBuffer(val)) {
      return val.toString('base64');
    }
    const arr = Array.from(val as unknown as ArrayLike<unknown>);
    return arr.map(cleanOpcuaValue);
  }

  // Handle LocalizedText / QualifiedName / NodeId object types from node-opcua
  if (typeof val === 'object' && val !== null) {
    // LocalizedText check
    if ('text' in val && 'locale' in val) {
      return (val as { text: unknown }).text;
    }
    // QualifiedName check
    if ('name' in val && 'namespaceIndex' in val) {
      return (val as { name: unknown }).name;
    }
    // NodeId check
    if ('identifier' in val && 'namespace' in val) {
      return val.toString();
    }
    // Int64 / UInt64 high-low object helper
    const cName = val.constructor?.name;
    if (cName === 'Int64' || cName === 'UInt64') {
      if (typeof (val as any).toNumber === 'function') {
        return (val as any).toNumber();
      }
    }
  }

  // Handle standard JS Arrays (recursively clean items)
  if (Array.isArray(val)) {
    return val.map(cleanOpcuaValue);
  }

  return val;
}

export function cleanOpcuaVariant(variant: any): unknown {
  if (variant === null || variant === undefined) {
    return null;
  }

  if (typeof variant === 'object') {
    const dataType = variant.dataType;
    const val = 'value' in variant ? variant.value : variant;
    const arrayType = variant.arrayType;

    if (dataType === 8) {
      // Int64
      const signMask = 0x80000000n;
      const shiftHigh = 4294967296n;
      const int64ToNumber = (v: any): number => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'bigint') return Number(v);
        if (typeof v === 'number') return v;
        if (Array.isArray(v) && v.length === 2) {
          const h = BigInt(v[0]);
          const l = BigInt(v[1]);
          if ((h & signMask) === signMask) {
            return Number((h & ~signMask) * shiftHigh + l - 0x8000000000000000n);
          } else {
            return Number(h * shiftHigh + l);
          }
        }
        return 0;
      };
      if (arrayType === 1) {
        return Array.isArray(val) ? val.map(int64ToNumber) : [];
      }
      return int64ToNumber(val);
    }

    if (dataType === 9) {
      // UInt64
      const shiftHigh = 4294967296n;
      const uint64ToNumber = (v: any): number => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'bigint') return Number(v);
        if (typeof v === 'number') return v;
        if (Array.isArray(v) && v.length === 2) {
          const h = BigInt(v[0]);
          const l = BigInt(v[1]);
          return Number(h * shiftHigh + l);
        }
        return 0;
      };
      if (arrayType === 1) {
        return Array.isArray(val) ? val.map(uint64ToNumber) : [];
      }
      return uint64ToNumber(val);
    }

    return cleanOpcuaValue(val);
  }

  return cleanOpcuaValue(variant);
}

/** Convert a DataValue-like object to a SourceDataValue. */
export function dataValueToSource(dv: {
  statusCode?: { value: number } | null;
  value?: { value: unknown } | null;
  sourceTimestamp?: Date | null;
  serverTimestamp?: Date | null;
}): SourceDataValue {
  const isGood = dv.statusCode ? dv.statusCode.value === 0 : false;
  return {
    value: cleanOpcuaVariant(dv.value),
    quality: isGood ? 'Good' : 'Bad',
    timestamp:
      dv.sourceTimestamp?.toISOString() ??
      dv.serverTimestamp?.toISOString() ??
      new Date().toISOString(),
    statusCode: dv.statusCode?.value,
  };
}

/** Convert a DataValue-like object to a SourceHistoricalValue. */
export function dataValueToHistorical(dv: {
  statusCode?: { value: number } | null;
  value?: { value: unknown } | null;
  sourceTimestamp?: Date | null;
  serverTimestamp?: Date | null;
}): SourceHistoricalValue {
  const isGood = dv.statusCode ? dv.statusCode.value === 0 : false;
  return {
    value: cleanOpcuaVariant(dv.value),
    quality: isGood ? 'Good' : 'Bad',
    timestamp:
      dv.sourceTimestamp?.toISOString() ??
      dv.serverTimestamp?.toISOString() ??
      new Date().toISOString(),
  };
}
