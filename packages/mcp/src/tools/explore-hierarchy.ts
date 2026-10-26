import { z } from 'zod';
import type { HierarchyNode, I3XClientBinding } from '../bindings/types.js';
import { isParentRelationship } from '../utils/relationships.js';

/** elementIds per /objects/related request: bounds body size and server work per call. */
const RELATED_BATCH_SIZE = 100;
/** Concurrent /objects/related requests while expanding one level. */
const RELATED_CONCURRENCY = 4;

export const exploreHierarchySchema = z.object({
  rootElementId: z
    .string()
    .optional()
    .describe(
      'Optional specific root asset elementId. If omitted, explores all root assets.',
    ),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(2)
    .describe(
      'Levels to show: 1 = roots only, 2 = roots and their children (default), 0 = unlimited (bounded by maxNodes)',
    ),
  maxNodes: z
    .number()
    .int()
    .min(1)
    .max(5000)
    .optional()
    .default(500)
    .describe(
      'Node budget for the whole tree (default 500, max 5000); the tree is marked truncated when reached',
    ),
});

type Asset = { elementId: string; displayName?: string; typeElementId?: string };

export async function handleExploreHierarchy(
  binding: I3XClientBinding,
  args: z.infer<typeof exploreHierarchySchema>,
) {
  const maxDepth = args.maxDepth ?? 2;
  const maxNodes = args.maxNodes ?? 500;

  let roots: Asset[];
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

  const toNode = (asset: Asset): HierarchyNode => ({
    elementId: asset.elementId,
    displayName: asset.displayName || asset.elementId,
    typeElementId: asset.typeElementId,
  });

  // Breadth-first, one bulk /objects/related call per batch of a level, instead of
  // one call per node: per-node fan-out timed out on large address spaces.
  let nodeCount = 0;
  let truncated = false;
  const expanded = new Set<string>();
  const tree: HierarchyNode[] = [];
  for (const root of roots) {
    if (nodeCount >= maxNodes) {
      truncated = true;
      break;
    }
    tree.push(toNode(root));
    nodeCount++;
  }

  let level = tree;
  for (let depth = 1; level.length > 0 && (maxDepth === 0 || depth < maxDepth); depth++) {
    // Expand each element once; a shared component or a cycle shows up as `repeated`.
    const toExpand: HierarchyNode[] = [];
    for (const node of level) {
      if (expanded.has(node.elementId)) node.repeated = true;
      else {
        expanded.add(node.elementId);
        toExpand.push(node);
      }
    }

    const related = await readRelatedInBatches(
      binding,
      toExpand.map((n) => n.elementId),
    );

    const next: HierarchyNode[] = [];
    toExpand.forEach((node, idx) => {
      const entry = related[idx];
      if (entry?.error) {
        node.error = entry.error;
        return;
      }
      const children = (entry?.result ?? [])
        .filter((r) => !isParentRelationship(r.sourceRelationship))
        .map((r) => r.object);
      if (children.length === 0) return;
      if (nodeCount + children.length > maxNodes) {
        truncated = true;
        node.truncated = true;
        return;
      }
      node.children = children.map(toNode);
      nodeCount += children.length;
      next.push(...node.children);
    });
    level = next;
  }

  return {
    totalRoots: roots.length,
    traversalDepth: maxDepth === 0 ? 'unlimited' : maxDepth,
    nodeCount,
    ...(truncated
      ? {
          truncated: {
            maxNodes,
            hint: 'Node budget reached; nodes marked truncated were not expanded. Use rootElementId on one of them, a smaller maxDepth, or a larger maxNodes.',
          },
        }
      : {}),
    plantTopology: tree,
  };
}

async function readRelatedInBatches(binding: I3XClientBinding, elementIds: string[]) {
  const batches: string[][] = [];
  for (let i = 0; i < elementIds.length; i += RELATED_BATCH_SIZE) {
    batches.push(elementIds.slice(i, i + RELATED_BATCH_SIZE));
  }
  const results: Awaited<ReturnType<I3XClientBinding['getRelatedObjectsBulk']>>[] =
    new Array(batches.length);
  let nextBatch = 0;
  const worker = async () => {
    while (nextBatch < batches.length) {
      const idx = nextBatch++;
      const batch = batches[idx]!;
      try {
        results[idx] = await binding.getRelatedObjectsBulk(batch);
      } catch (err) {
        // A failed request marks its own nodes only; the rest of the walk goes on.
        const error = err instanceof Error ? err.message : String(err);
        results[idx] = batch.map((elementId) => ({ elementId, error }));
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(RELATED_CONCURRENCY, batches.length) }, worker),
  );
  return results.flat();
}
