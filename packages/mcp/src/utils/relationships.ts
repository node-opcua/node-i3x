/**
 * Child-to-parent relationship names in `/objects/related` results: node-i3x's
 * IsComponentOf and the i3X spec's ComponentOf / HasParent. Everything else points
 * away from the source object.
 */
const PARENT_RELATIONSHIPS = new Set(['IsComponentOf', 'ComponentOf', 'HasParent']);

export function isParentRelationship(sourceRelationship: string): boolean {
  return PARENT_RELATIONSHIPS.has(sourceRelationship);
}
