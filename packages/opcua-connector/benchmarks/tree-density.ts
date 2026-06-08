// -----------------------------------------------------------------
// Analyze OPC UA tree density — find the densest subtrees
//
// Connects to a server, browses the full tree, and reports:
//   - Top 20 nodes with the most direct children
//   - Tree depth distribution
//   - Subtree sizes (recursive child count)
// -----------------------------------------------------------------

import {
  OPCUAClient,
  MessageSecurityMode,
  type ClientSession,
  BrowseDirection,
  NodeClass,
  type ReferenceDescription,
  coerceNodeId,
  resolveNodeId,
} from 'node-opcua';
import { wrapSessionIfOptimized } from '../src/optimized.js';
import { consoleLogger } from '@i3x/core';

const ENDPOINT = process.env.NODE_I3X_OPCUA_ENDPOINT
  ?? 'opc.tcp://opcuademo.sterfive.com:26541';

interface TreeNode {
  nodeId: string;
  name: string;
  nodeClass: string;
  depth: number;
  parentId: string | null;
  childIds: string[];
}

async function browseSingleNode(
  session: ClientSession,
  nodeId: string,
): Promise<ReferenceDescription[]> {
  const result = await session.browse({
    nodeId: coerceNodeId(nodeId),
    browseDirection: BrowseDirection.Forward,
    includeSubtypes: true,
    referenceTypeId: resolveNodeId('HierarchicalReferences'),
    resultMask: 63,
    requestedMaxReferencesPerNode: 0,
  } as any);

  const refs: ReferenceDescription[] = [...(result.references ?? [])];
  let cp = result.continuationPoint;
  while (cp) {
    const next = await session.browseNext(cp, false);
    refs.push(...(next.references ?? []));
    cp = next.continuationPoint;
  }
  return refs;
}

async function main() {
  console.log(`\n=== OPC UA Tree Density Analysis ===`);
  console.log(`Endpoint: ${ENDPOINT}\n`);

  const client = OPCUAClient.create({
    securityMode: MessageSecurityMode.None,
    endpointMustExist: false,
    connectionStrategy: { maxRetry: 2, initialDelay: 1000, maxDelay: 5000 },
  });

  await client.connect(ENDPOINT);
  const rawSession = await client.createSession();
  const session = await wrapSessionIfOptimized(rawSession, consoleLogger);

  // ── BFS with full tree info ────────────────────────
  const nodes = new Map<string, TreeNode>();
  const objectsFolderId = resolveNodeId('ObjectsFolder').toString();
  const visited = new Set<string>();

  let frontier: Array<{ nodeId: string; parentId: string | null; depth: number }> = [
    { nodeId: objectsFolderId, parentId: null, depth: 0 },
  ];

  const t0 = performance.now();

  while (frontier.length > 0) {
    const wave = frontier.filter((f) => !visited.has(f.nodeId));
    for (const item of wave) visited.add(item.nodeId);
    if (wave.length === 0) break;

    const allRefs = await Promise.all(
      wave.map((w) => browseSingleNode(session, w.nodeId)),
    );

    const nextFrontier: typeof frontier = [];
    for (let i = 0; i < wave.length; i++) {
      const item = wave[i]!;
      const refs = allRefs[i]!;

      const childIds: string[] = [];
      for (const ref of refs) {
        const childId = ref.nodeId.toString();
        if (visited.has(childId)) continue;
        childIds.push(childId);

        nodes.set(childId, {
          nodeId: childId,
          name: ref.displayName?.text ?? ref.browseName.name ?? childId,
          nodeClass: NodeClass[ref.nodeClass] ?? String(ref.nodeClass),
          depth: item.depth + 1,
          parentId: item.nodeId === objectsFolderId ? null : item.nodeId,
          childIds: [], // filled later
        });

        if (
          ref.nodeClass === NodeClass.Object ||
          ref.nodeClass === NodeClass.Variable
        ) {
          nextFrontier.push({
            nodeId: childId,
            parentId: item.nodeId,
            depth: item.depth + 1,
          });
        }
      }

      // Update parent's childIds
      const parentNode = nodes.get(item.nodeId);
      if (parentNode) {
        parentNode.childIds = childIds;
      }
    }
    frontier = nextFrontier;
  }

  const elapsed = performance.now() - t0;
  console.log(`Browsed ${nodes.size} nodes in ${elapsed.toFixed(0)}ms\n`);

  // ── Analysis 1: Top 20 densest nodes (most direct children) ──
  const byChildCount = [...nodes.values()]
    .filter((n) => n.childIds.length > 0)
    .sort((a, b) => b.childIds.length - a.childIds.length);

  console.log('=== Top 20 Densest Nodes (most direct children) ===');
  console.log('');
  console.log(
    'Rank  Children  Depth  NodeClass   Name                                    NodeId',
  );
  console.log('-'.repeat(110));
  for (let i = 0; i < Math.min(20, byChildCount.length); i++) {
    const n = byChildCount[i]!;
    const name = n.name.substring(0, 38).padEnd(40);
    const cls = n.nodeClass.padEnd(12);
    console.log(
      `${String(i + 1).padStart(4)}  ${String(n.childIds.length).padStart(8)}  ${String(n.depth).padStart(5)}  ${cls}${name}${n.nodeId}`,
    );
  }

  // ── Analysis 2: Depth distribution ─────────────────
  const depthBuckets = new Map<number, number>();
  for (const n of nodes.values()) {
    depthBuckets.set(n.depth, (depthBuckets.get(n.depth) ?? 0) + 1);
  }

  console.log('\n=== Depth Distribution ===\n');
  const maxDepth = Math.max(...depthBuckets.keys());
  for (let d = 1; d <= maxDepth; d++) {
    const count = depthBuckets.get(d) ?? 0;
    const bar = '#'.repeat(Math.min(60, Math.round(count / 10)));
    console.log(`  Depth ${String(d).padStart(2)}: ${String(count).padStart(5)} nodes  ${bar}`);
  }

  // ── Analysis 3: NodeClass distribution ─────────────
  const classBuckets = new Map<string, number>();
  for (const n of nodes.values()) {
    classBuckets.set(n.nodeClass, (classBuckets.get(n.nodeClass) ?? 0) + 1);
  }

  console.log('\n=== NodeClass Distribution ===\n');
  for (const [cls, count] of [...classBuckets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cls.padEnd(15)} ${count}`);
  }

  // ── Analysis 4: Recursive subtree sizes (top 20) ───
  function subtreeSize(nodeId: string): number {
    const node = nodes.get(nodeId);
    if (!node) return 0;
    let size = 1;
    for (const cId of node.childIds) {
      size += subtreeSize(cId);
    }
    return size;
  }

  const subtrees = [...nodes.values()]
    .filter((n) => n.depth <= 2 && n.childIds.length > 0)
    .map((n) => ({ ...n, subtreeSize: subtreeSize(n.nodeId) }))
    .sort((a, b) => b.subtreeSize - a.subtreeSize);

  console.log('\n=== Top 20 Largest Subtrees (depth <= 2) ===\n');
  console.log(
    'Rank  Subtree   Direct  Depth  Name                                    NodeId',
  );
  console.log('-'.repeat(110));
  for (let i = 0; i < Math.min(20, subtrees.length); i++) {
    const n = subtrees[i]!;
    const name = n.name.substring(0, 38).padEnd(40);
    console.log(
      `${String(i + 1).padStart(4)}  ${String(n.subtreeSize).padStart(7)}  ${String(n.childIds.length).padStart(6)}  ${String(n.depth).padStart(5)}  ${name}${n.nodeId}`,
    );
  }

  console.log('');

  await rawSession.close();
  await client.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
