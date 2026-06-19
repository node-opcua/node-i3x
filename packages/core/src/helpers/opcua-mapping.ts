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

/** Convert a DataValue-like object to a SourceDataValue. */
export function dataValueToSource(dv: {
  statusCode?: { value: number } | null;
  value?: { value: unknown } | null;
  sourceTimestamp?: Date | null;
  serverTimestamp?: Date | null;
}): SourceDataValue {
  const isGood = dv.statusCode ? dv.statusCode.value === 0 : false;
  return {
    value: dv.value?.value ?? null,
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
    value: dv.value?.value ?? null,
    quality: isGood ? 'Good' : 'Bad',
    timestamp:
      dv.sourceTimestamp?.toISOString() ??
      dv.serverTimestamp?.toISOString() ??
      new Date().toISOString(),
  };
}
