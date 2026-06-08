// ─────────────────────────────────────────────────────────────
// @i3x/core  —  Mapper (pure functions)
// ─────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import type { NodeKind, ModelNode } from '../domain/model-node.js';
import type { SourceNodeInfo } from '../ports/data-source.js';

const CLASS_TO_KIND: Record<string, NodeKind> = {
  Object: 'asset',
  Variable: 'property',
  Method: 'action',
};

/**
 * Derive a stable, deterministic i3X element ID.
 * Format: `{kind}-{sha1_prefix_16}`
 */
export function stableI3xId(sourceNodeId: string, kind: NodeKind): string {
  const digest = createHash('sha1')
    .update(sourceNodeId, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `${kind}-${digest}`;
}

/** Infer the i3X NodeKind from source node metadata. */
export function inferKind(node: SourceNodeInfo): NodeKind {
  if (node.eventNotifier) return 'eventSource';
  return CLASS_TO_KIND[node.nodeClass] ?? 'asset';
}

export function mapType(node: SourceNodeInfo, kind: NodeKind): string | null {
  return kind === 'property' ? (node.dataType ?? null) : null;
}

/** Project a source node into an i3X ModelNode. Pure function. */
export function mapNode(
  node: SourceNodeInfo,
  childIds: readonly string[],
): ModelNode {
  const kind = inferKind(node);
  return {
    id: stableI3xId(node.sourceNodeId, kind),
    name: node.displayName || node.browseName,
    kind,
    type: mapType(node, kind),
    children: childIds,
    sourceNodeId: node.sourceNodeId,
  };
}
