/**
 * Performance test bed for i3X startup against a real OPC UA server.
 *
 * Usage:
 *   npx tsx scripts/perf-testbed.ts [endpoint]
 *
 * Default endpoint: opc.tcp://opcuademo.sterfive.com:26541
 */
import { performance } from 'node:perf_hooks';
import {
  consoleLogger,
  ModelService,
  TypeService,
} from '@node-i3x/core';
import {
  OpcUaClient,
  OpcUaDataSourceAdapter,
} from '@node-i3x/opcua-connector';

const endpoint =
  process.argv[2] ?? 'opc.tcp://opcuademo.sterfive.com:26541';
const logger = consoleLogger;

function elapsed(start: number): string {
  return `${(performance.now() - start).toFixed(0)}ms`;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  i3X Performance Test Bed');
  console.log(`  Endpoint: ${endpoint}`);
  console.log('═══════════════════════════════════════════\n');

  // ── 1. Connect ──────────────────────────────────────
  let t = performance.now();
  console.log('⏳ Connecting to OPC UA server...');

  const opcuaClient = new OpcUaClient(
    {
      endpointUrl: endpoint,
      securityMode: 'None',
      optimizedClient: 'auto',
    },
    logger,
  );
  const dataSource = new OpcUaDataSourceAdapter(opcuaClient, logger);
  await dataSource.connect();
  console.log(`✅ Connected in ${elapsed(t)}\n`);

  // ── 2. Model preload ───────────────────────────────
  const modelService = new ModelService(dataSource, logger);

  t = performance.now();
  console.log('⏳ Preloading model (browseTree)...');
  const model = await modelService.preloadModel();
  const modelMs = elapsed(t);
  console.log(
    `✅ Model loaded: ${model.nodesById.size} nodes, ` +
      `${model.rootIds.length} roots in ${modelMs}\n`,
  );

  // ── 3. Type preload ────────────────────────────────
  const typeService = new TypeService(dataSource, logger);

  t = performance.now();
  console.log('⏳ Preloading types (getObjectTypes + enrichment)...');
  await typeService.preloadTypes();
  const typeMs = elapsed(t);
  console.log(`✅ Types loaded in ${typeMs}\n`);

  // ── 4. Summary ─────────────────────────────────────
  console.log('═══════════════════════════════════════════');
  console.log('  Summary');
  console.log('───────────────────────────────────────────');
  console.log(`  Model:   ${model.nodesById.size} nodes in ${modelMs}`);
  console.log(`  Types:   loaded in ${typeMs}`);
  console.log('═══════════════════════════════════════════\n');

  // ── Cleanup ────────────────────────────────────────
  await dataSource.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
