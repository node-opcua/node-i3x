import { createRequire } from 'node:module';
import { Command } from 'commander';
import type { I3xConfig } from './config.js';
import { resolveConfig } from './config.js';
import { startServer } from './server.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('i3x')
  .description('Expose OPC UA servers as i3X REST APIs')
  .version(pkg.version)
  .option('-e, --endpoint <url>', 'OPC UA endpoint URL')
  .option('-p, --port <port>', 'REST API port', parseInt)
  .option('-H, --host <host>', 'REST API bind address')
  .option('--security-mode <mode>', 'OPC UA security mode')
  .option('--optimized-client <mode>', 'Optimized client: auto | disabled')
  .option(
    '--subscription-interval <seconds>',
    'Subscription interval in seconds',
    parseInt,
  )
  .option('--log-level <level>', 'Log level: debug | info | warn | error')
  .option('--no-model-preload', 'Skip model preload on startup')
  .option('--username <user>', 'OPC UA username for UserName identity token')
  .option('--password <pass>', 'OPC UA password for UserName identity token')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (opts) => {
    // Build partial config from CLI args
    const cliArgs: Partial<I3xConfig> = {};
    if (opts.endpoint) cliArgs.endpoint = opts.endpoint;
    if (opts.port !== undefined) cliArgs.port = opts.port;
    if (opts.host) cliArgs.host = opts.host;
    if (opts.securityMode) cliArgs.securityMode = opts.securityMode;
    if (opts.optimizedClient) cliArgs.optimizedClient = opts.optimizedClient;
    if (opts.subscriptionInterval !== undefined)
      cliArgs.subscriptionInterval = opts.subscriptionInterval;
    if (opts.logLevel) cliArgs.logLevel = opts.logLevel;
    if (opts.modelPreload === false) cliArgs.modelPreload = false;
    if (opts.username) cliArgs.username = opts.username;
    if (opts.password) cliArgs.password = opts.password;

    const config = await resolveConfig(cliArgs, opts.config);
    await startServer(config, pkg.version);
  });

program.parse();
