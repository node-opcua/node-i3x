/**
 * Milo test bed with depth limit to prove limited crawling time.
 * Run with:
 *   npx tsx scripts/milo-testbed.ts
 */
process.env.NODEOPCUADEBUG = 'CLIENT{TRACE}';

import { performance } from 'node:perf_hooks';
import { consoleLogger, ModelService } from '@node-i3x/core';
import { OpcUaClient, OpcUaDataSourceAdapter } from '@node-i3x/opcua-connector';

const endpoint = 'opc.tcp://milo.digitalpetri.com:62541/milo';
const logger = consoleLogger;

function elapsed(start: number): string {
  return `${(performance.now() - start).toFixed(0)}ms`;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Milo Limited Crawl Test Bed');
  console.log(`  Endpoint: ${endpoint}`);
  console.log('  Max Depth: 50');
  console.log('═══════════════════════════════════════════\n');

  let t = performance.now();
  console.log('⏳ Connecting to Milo OPC UA server...');

  const opcuaClient = new OpcUaClient(
    {
      endpointUrl: endpoint,
      securityMode: 'None',
      optimizedClient: 'auto',
      browseMaxDepth: 50, // limit depth to 50
    },
    logger,
  );
  const dataSource = new OpcUaDataSourceAdapter(opcuaClient, logger);
  await dataSource.connect();
  console.log(`✅ Connected in ${elapsed(t)}\n`);

  const modelService = new ModelService(dataSource, logger);

  t = performance.now();
  console.log('⏳ Preloading model (browseTree) with Depth Limit = 50...');
  const model = await modelService.preloadModel();
  const modelMs = elapsed(t);
  console.log(
    `✅ Model loaded successfully: ${model.nodesById.size} nodes, ` +
      `${model.rootIds.length} roots in ${modelMs}\n`,
  );

  console.log('═══════════════════════════════════════════');
  console.log(`  Crawl finished in ${modelMs}`);
  console.log(`  Discovered ${model.nodesById.size} nodes within depth 50.`);
  console.log('═══════════════════════════════════════════\n');

  await dataSource.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
