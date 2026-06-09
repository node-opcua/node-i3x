// -----------------------------------------------------------------
// Benchmark: browseAll() vs manual browse+browseNext with parallelism
//
// Connects to an OPC UA server, discovers the full address space
// using both strategies, and compares node counts + timings.
// -----------------------------------------------------------------

import {
  OPCUAClient,
  MessageSecurityMode,
  type ClientSession,
  BrowseDirection,
  NodeClass,
  type ReferenceDescription,
  type BrowseResult,
  type BrowseDescription,
  coerceNodeId,
  resolveNodeId,
  browseAll,
} from 'node-opcua';
import { wrapSessionIfOptimized } from '../src/optimized.js';
import { consoleLogger } from '@node-i3x/core';

const ENDPOINT = process.env.NODE_I3X_OPCUA_ENDPOINT
  ?? 'opc.tcp://opcuademo.sterfive.com:26541';

// ── Shared helpers ────────────────────────────────────────────

function makeBrowseDescription(nodeId: string): BrowseDescription {
  return {
    nodeId: coerceNodeId(nodeId),
    browseDirection: BrowseDirection.Forward,
    includeSubtypes: true,
    referenceTypeId: resolveNodeId('HierarchicalReferences'),
    resultMask: 63,
    requestedMaxReferencesPerNode: 0,
  } as BrowseDescription;
}

interface BrowseStats {
  count: number;
  ms: number;
  nodeIds: Set<string>;
  waveCount: number;
}

// ── Strategy 1: browseAll (current) ───────────────────────────

async function browseWithBrowseAll(
  session: ClientSession,
): Promise<BrowseStats> {
  const t0 = performance.now();
  const visited = new Set<string>();
  const discoveredIds = new Set<string>();
  const objectsFolderId = resolveNodeId('ObjectsFolder').toString();
  let waveCount = 0;

  let frontier: string[] = [objectsFolderId];

  while (frontier.length > 0) {
    const wave = frontier.filter((id) => !visited.has(id));
    for (const id of wave) visited.add(id);
    if (wave.length === 0) break;
    waveCount++;

    const descriptions = wave.map(makeBrowseDescription);
    const results = await browseAll(session, descriptions);

    const nextFrontier: string[] = [];
    for (let i = 0; i < wave.length; i++) {
      const refs = results[i]!.references ?? [];
      for (const ref of refs) {
        const childId = ref.nodeId.toString();
        if (visited.has(childId)) continue;
        discoveredIds.add(childId);
        if (
          ref.nodeClass === NodeClass.Object ||
          ref.nodeClass === NodeClass.Variable
        ) {
          nextFrontier.push(childId);
        }
      }
    }
    frontier = nextFrontier;
  }

  return {
    count: discoveredIds.size,
    ms: performance.now() - t0,
    nodeIds: discoveredIds,
    waveCount,
  };
}

// ── Strategy 2: manual browse + browseNext with Promise.all ───

async function browseSingleNode(
  session: ClientSession,
  nodeId: string,
): Promise<ReferenceDescription[]> {
  const desc = makeBrowseDescription(nodeId);
  const result: BrowseResult = await session.browse(desc);
  const refs: ReferenceDescription[] = [
    ...(result.references ?? []),
  ];

  // Follow continuation points
  let cp = result.continuationPoint;
  while (cp) {
    const next: BrowseResult = await session.browseNext(cp, false);
    refs.push(...(next.references ?? []));
    cp = next.continuationPoint;
  }

  return refs;
}

async function browseWithParallelBrowseNext(
  session: ClientSession,
): Promise<BrowseStats> {
  const t0 = performance.now();
  const visited = new Set<string>();
  const discoveredIds = new Set<string>();
  const objectsFolderId = resolveNodeId('ObjectsFolder').toString();
  let waveCount = 0;

  let frontier: string[] = [objectsFolderId];

  while (frontier.length > 0) {
    const wave = frontier.filter((id) => !visited.has(id));
    for (const id of wave) visited.add(id);
    if (wave.length === 0) break;
    waveCount++;

    // Browse ALL nodes in the wave in parallel
    const allRefs = await Promise.all(
      wave.map((nodeId) => browseSingleNode(session, nodeId)),
    );

    const nextFrontier: string[] = [];
    for (let i = 0; i < wave.length; i++) {
      const refs = allRefs[i]!;
      for (const ref of refs) {
        const childId = ref.nodeId.toString();
        if (visited.has(childId)) continue;
        discoveredIds.add(childId);
        if (
          ref.nodeClass === NodeClass.Object ||
          ref.nodeClass === NodeClass.Variable
        ) {
          nextFrontier.push(childId);
        }
      }
    }
    frontier = nextFrontier;
  }

  return {
    count: discoveredIds.size,
    ms: performance.now() - t0,
    nodeIds: discoveredIds,
    waveCount,
  };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Browse Strategy Benchmark ===`);
  console.log(`Endpoint: ${ENDPOINT}\n`);

  const client = OPCUAClient.create({
    securityMode: MessageSecurityMode.None,
    endpointMustExist: false,
    connectionStrategy: {
      maxRetry: 2,
      initialDelay: 1000,
      maxDelay: 5000,
    },
  });

  await client.connect(ENDPOINT);
  const rawSession = await client.createSession();
  console.log('Session created\n');

  const session = await wrapSessionIfOptimized(rawSession, consoleLogger);

  // ── Run Strategy 1: browseAll ──────────────────────
  console.log('Strategy 1: browseAll()...');
  const r1 = await browseWithBrowseAll(session);
  console.log(
    `  Nodes: ${r1.count}  Waves: ${r1.waveCount}  Time: ${r1.ms.toFixed(0)}ms\n`,
  );

  // ── Run Strategy 2: parallel browse+browseNext ─────
  console.log('Strategy 2: parallel browse() + browseNext()...');
  const r2 = await browseWithParallelBrowseNext(session);
  console.log(
    `  Nodes: ${r2.count}  Waves: ${r2.waveCount}  Time: ${r2.ms.toFixed(0)}ms\n`,
  );

  // ── Comparison ─────────────────────────────────────
  console.log('=== Results ===');
  console.log(`  browseAll():          ${r1.count} nodes, ${r1.waveCount} waves, ${r1.ms.toFixed(0)}ms`);
  console.log(`  browse+browseNext():  ${r2.count} nodes, ${r2.waveCount} waves, ${r2.ms.toFixed(0)}ms`);

  // Set comparison
  const onlyInBrowseAll = [...r1.nodeIds].filter((id) => !r2.nodeIds.has(id));
  const onlyInParallel = [...r2.nodeIds].filter((id) => !r1.nodeIds.has(id));

  if (onlyInBrowseAll.length === 0 && onlyInParallel.length === 0) {
    console.log(`\n  ✅ EXACT MATCH — both discovered identical sets of ${r1.count} nodes`);
  } else {
    console.log(`\n  ❌ SET DIFFERENCE:`);
    if (onlyInBrowseAll.length > 0) {
      console.log(`    Only in browseAll (${onlyInBrowseAll.length}):`);
      for (const id of onlyInBrowseAll.slice(0, 10)) console.log(`      ${id}`);
      if (onlyInBrowseAll.length > 10) console.log(`      ... and ${onlyInBrowseAll.length - 10} more`);
    }
    if (onlyInParallel.length > 0) {
      console.log(`    Only in browse+browseNext (${onlyInParallel.length}):`);
      for (const id of onlyInParallel.slice(0, 10)) console.log(`      ${id}`);
      if (onlyInParallel.length > 10) console.log(`      ... and ${onlyInParallel.length - 10} more`);
    }
  }

  const faster = r1.ms < r2.ms ? 'browseAll' : 'browse+browseNext';
  const ratio = r1.ms < r2.ms
    ? (r2.ms / r1.ms).toFixed(1)
    : (r1.ms / r2.ms).toFixed(1);
  console.log(`\n  ⚡ ${faster} is ${ratio}x faster\n`);

  await rawSession.close();
  await client.disconnect();
  console.log('Disconnected.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
