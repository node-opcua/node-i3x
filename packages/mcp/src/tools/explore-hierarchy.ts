import { z } from 'zod';
import type { HierarchyNode, I3XClientBinding } from '../bindings/types.js';
import { isParentRelationship } from '../utils/relationships.js';

export const exploreHierarchySchema = z.object({
  rootElementId: z
    .string()
    .optional()
    .describe(
      'Optional specific root asset elementId. If omitted, explores all root assets.',
    ),
  maxDepth: z
    .number()
    .optional()
    .default(2)
    .describe('Maximum depth to traverse child components (1 to 5, default: 2)'),
});

export async function handleExploreHierarchy(
  binding: I3XClientBinding,
  args: z.infer<typeof exploreHierarchySchema>,
) {
  const maxDepth = Math.min(Math.max(args.maxDepth || 2, 1), 5);

  let roots: Array<{ elementId: string; displayName?: string; typeElementId?: string }>;

  if (args.rootElementId) {
    const root = await binding.getObjectById(args.rootElementId);
    if (!root) {
      const suggestions = await binding.findSuggestions(args.rootElementId);
      return {
        error: `Root asset '${args.rootElementId}' not found.`,
        suggestions,
      };
    }
    roots = [root];
  } else {
    roots = await binding.getObjects({ rootOnly: true });
  }

  async function buildNode(
    asset: { elementId: string; displayName?: string; typeElementId?: string },
    currentDepth: number,
    visited: Set<string>,
  ): Promise<HierarchyNode> {
    const node: HierarchyNode = {
      elementId: asset.elementId,
      displayName: asset.displayName || asset.elementId,
      typeElementId: asset.typeElementId,
    };

    visited.add(asset.elementId);

    if (currentDepth < maxDepth) {
      // Follow children only: related objects also include the parent. Not filtered
      // on parentId, which names a single parent: a shared component has several.
      const related = await binding.getRelatedObjects(asset.elementId);
      const unvisitedChildren = related
        .filter((r) => !isParentRelationship(r.sourceRelationship))
        .map((r) => r.object)
        .filter((c) => !visited.has(c.elementId));

      if (unvisitedChildren.length > 0) {
        node.children = await Promise.all(
          unvisitedChildren.map((child) =>
            buildNode(child, currentDepth + 1, new Set(visited)),
          ),
        );
      }
    }

    return node;
  }

  const hierarchyTree = await Promise.all(
    roots.map((root) => buildNode(root, 1, new Set<string>())),
  );

  return {
    totalRoots: roots.length,
    traversalDepth: maxDepth,
    plantTopology: hierarchyTree,
  };
}
