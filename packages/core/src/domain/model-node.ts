// ─────────────────────────────────────────────────────────────
// @i3x/core  —  Domain models
// ─────────────────────────────────────────────────────────────

/** The four i3X node kinds mapped from OPC UA node classes. */
export type NodeKind = 'asset' | 'property' | 'action' | 'eventSource';

/** OPC UA data quality indicators. */
export type DataQuality = 'Good' | 'GoodNoData' | 'Bad' | 'Uncertain';

/**
 * A single node in the i3X model tree.
 *
 * Every node in the browsed address-space is projected to exactly one
 * ModelNode.  The `id` is a stable, hash-based identifier derived from
 * the source system's native node id and the inferred kind.
 */
export interface ModelNode {
  readonly id: string;
  readonly name: string;
  readonly kind: NodeKind;
  readonly type: string | null;
  readonly children: readonly string[];
  readonly sourceNodeId: string;
  readonly namespaceUri: string;
}

/**
 * The fully-resolved model snapshot produced by a model build.
 *
 * All maps are keyed by stable i3X element id.
 */
export interface BuildResult {
  readonly nodesById: ReadonlyMap<string, ModelNode>;
  readonly rootIds: readonly string[];
  readonly childrenById: ReadonlyMap<string, readonly string[]>;
  /** property element-id → source node id */
  readonly propertyToSource: ReadonlyMap<string, string>;
  /** action element-id → [parent source node id, method source node id] */
  readonly actionToMethod: ReadonlyMap<string, readonly [string, string]>;
}
