// ─────────────────────────────────────────────────────────────
// @i3x/opcua-connector — OPC UA → domain mapping helpers
// ─────────────────────────────────────────────────────────────

import {
  type DataValue,
  type ReferenceDescription,
  NodeClass,
  StatusCodes,
} from 'node-opcua';
import type { SourceNodeInfo, SourceDataValue, SourceHistoricalValue } from '@i3x/core';

const NODE_CLASS_NAMES: Record<number, string> = {
  [NodeClass.Object]: 'Object',
  [NodeClass.Variable]: 'Variable',
  [NodeClass.Method]: 'Method',
  [NodeClass.ObjectType]: 'ObjectType',
  [NodeClass.VariableType]: 'VariableType',
  [NodeClass.ReferenceType]: 'ReferenceType',
  [NodeClass.DataType]: 'DataType',
  [NodeClass.View]: 'View',
};

/** Convert a node-opcua ReferenceDescription to a SourceNodeInfo. */
export function refToSourceNode(
  ref: ReferenceDescription,
  parentSourceNodeId: string | null,
): SourceNodeInfo {
  const nodeClass = ref.nodeClass ?? NodeClass.Unspecified;
  return {
    sourceNodeId: ref.nodeId.toString(),
    parentSourceNodeId,
    browseName: ref.browseName?.toString() ?? '',
    displayName: ref.displayName?.text ?? ref.browseName?.toString() ?? '',
    nodeClass: NODE_CLASS_NAMES[nodeClass] ?? 'Unknown',
    dataType: (ref as Record<string, unknown>).dataType
      ? String((ref as Record<string, unknown>).dataType)
      : null,
    eventNotifier: (ref.nodeClass === NodeClass.Object)
      ? (((ref as Record<string, unknown>).eventNotifier as number) ?? 0) !== 0
      : false,
  };
}

/** Convert a node-opcua DataValue to a SourceDataValue. */
export function dataValueToSource(dv: DataValue): SourceDataValue {
  const isGood = dv.statusCode?.equals(StatusCodes.Good) ?? false;
  return {
    value: dv.value?.value ?? null,
    quality: isGood ? 'Good' : 'Bad',
    timestamp: dv.sourceTimestamp?.toISOString()
      ?? dv.serverTimestamp?.toISOString()
      ?? new Date().toISOString(),
    statusCode: dv.statusCode?.value,
  };
}

/** Convert a node-opcua historical DataValue to a SourceHistoricalValue. */
export function dataValueToHistorical(dv: DataValue): SourceHistoricalValue {
  return {
    value: dv.value?.value ?? null,
    quality: dv.statusCode?.equals(StatusCodes.Good) ? 'Good' : 'Bad',
    timestamp: dv.sourceTimestamp?.toISOString()
      ?? dv.serverTimestamp?.toISOString()
      ?? new Date().toISOString(),
  };
}
