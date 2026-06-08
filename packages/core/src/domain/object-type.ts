// ─────────────────────────────────────────────────────────────
// @i3x/core  —  ObjectType value object
// ─────────────────────────────────────────────────────────────

/** An i3X object-type projection. */
export interface ObjectType {
  readonly elementId: string;
  readonly displayName: string;
  readonly namespaceUri: string;
  readonly sourceTypeId: string;
  readonly version: string | null;
  readonly schema: Record<string, unknown>;
  readonly related: Record<string, unknown> | null;
}

/** A relationship type between i3X objects. */
export interface RelationshipType {
  readonly elementId: string;
  readonly displayName: string;
  readonly namespaceUri: string;
  readonly relationshipId: string;
  readonly reverseOf: string;
}
