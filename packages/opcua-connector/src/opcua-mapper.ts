// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — OPC UA → domain mapping helpers
// ─────────────────────────────────────────────────────────────

import type {
  SourceDataValue,
  SourceHistoricalValue,
  SourceNodeInfo,
} from '@node-i3x/core';
import {
  type DataValue,
  NodeClass,
  type QualifiedName,
  type ReferenceDescription,
  StatusCodes,
} from 'node-opcua';

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

/**
 * Convert a QualifiedName to its namespace-URI-qualified form.
 *
 * Resolves the volatile namespace *index* to the stable namespace
 * *URI* using the server's namespace array, producing a string of
 * the form `"nsu=http://example.com/:BrowseName"`.
 *
 * This is the key building-block for stable element IDs that
 * survive OPC UA server restarts (even when namespace indices shift).
 */
export function qualifiedNameToNsu(
  browseName: QualifiedName | null | undefined,
  namespaceArray: readonly string[],
): string {
  if (!browseName?.name) return '';
  const nsIdx = browseName.namespaceIndex ?? 0;
  const nsUri = namespaceArray[nsIdx] ?? `ns=${nsIdx}`;
  return `nsu=${nsUri}:${browseName.name}`;
}

/** Convert a node-opcua ReferenceDescription to a SourceNodeInfo. */
export function refToSourceNode(
  ref: ReferenceDescription,
  parentSourceNodeId: string | null,
  namespaceArray: readonly string[],
): SourceNodeInfo {
  const nodeClass = ref.nodeClass ?? NodeClass.Unspecified;
  const nsuQName = qualifiedNameToNsu(ref.browseName, namespaceArray);

  // Extract namespace URI from the nsu-qualified name
  // Format: "nsu=<URI>:<BrowseName>"
  let namespaceUri = '';
  const nsuMatch = nsuQName.match(/^nsu=(.+):([^:]+)$/);
  if (nsuMatch) {
    namespaceUri = nsuMatch[1]!;
  } else {
    // Fallback: resolve from namespace array directly
    const nsIdx = ref.browseName?.namespaceIndex ?? 0;
    namespaceUri = namespaceArray[nsIdx] ?? '';
  }

  return {
    sourceNodeId: ref.nodeId.toString(),
    parentSourceNodeId,
    browseName: ref.browseName?.toString() ?? '',
    nsuQualifiedName: nsuQName,
    displayName: ref.displayName?.text ?? ref.browseName?.toString() ?? '',
    nodeClass: NODE_CLASS_NAMES[nodeClass] ?? 'Unknown',
    typeDefinition: ref.typeDefinition ? ref.typeDefinition.toString() : null,
    namespaceUri,
    eventNotifier:
      ref.nodeClass === NodeClass.Object
        ? (((ref as unknown as Record<string, unknown>).eventNotifier as number) ?? 0) !==
          0
        : false,
  };
}

/** Convert a node-opcua DataValue to a SourceDataValue. */
export function dataValueToSource(dv: DataValue): SourceDataValue {
  const isGood = dv.statusCode?.equals(StatusCodes.Good) ?? false;
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

/** Convert a node-opcua historical DataValue to a SourceHistoricalValue. */
export function dataValueToHistorical(dv: DataValue): SourceHistoricalValue {
  return {
    value: dv.value?.value ?? null,
    quality: dv.statusCode?.equals(StatusCodes.Good) ? 'Good' : 'Bad',
    timestamp:
      dv.sourceTimestamp?.toISOString() ??
      dv.serverTimestamp?.toISOString() ??
      new Date().toISOString(),
  };
}
