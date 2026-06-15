// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — OPC UA → domain mapping helpers
// ─────────────────────────────────────────────────────────────

import {
  NODE_CLASS_NAMES,
  qualifiedNameToNsu,
  type SourceNodeInfo,
} from '@node-i3x/core';
import { NodeClass, type ReferenceDescription } from 'node-opcua';

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
