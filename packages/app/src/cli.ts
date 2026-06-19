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
  .option(
    '--security-mode <mode>',
    'OPC UA security mode (None, Sign, SignAndEncrypt, Auto)',
  )
  .option('--security-policy <policy>', 'OPC UA security policy (e.g. Basic256Sha256)')
  .option('--pki-folder <path>', 'PKI folder for certificate storage')
  .option(
    '--certificate-subject <subject>',
    'X.500 subject for the client certificate (e.g. /CN=my-app/O=Acme/OU=user@acme.com)',
  )
  .option('--optimized-client <mode>', 'Optimized client: auto | disabled')
  .option(
    '--publish-interval <ms>',
    'OPC UA publishing interval in milliseconds',
    parseInt,
  )
  .option(
    '--sampling-interval <ms>',
    'OPC UA sampling interval in milliseconds',
    parseInt,
  )
  .option('--log-level <level>', 'Log level: debug | info | warn | error')
  .option('--no-preload', 'Skip model preload on startup')
  .option('--preload-strict', 'Exit if model preload fails')
  .option('--username <user>', 'OPC UA username for UserName identity token')
  .option('--password <pass>', 'OPC UA password for UserName identity token')
  .option('--read-only', 'Disable write operations (advertise read-only capabilities)')
  .option('--experimental', 'Enable experimental convenience and extension routes')
  .option(
    '--no-require-auth',
    'Allow requests without Bearer token when apiKey is configured',
  )
  .option('--api-key <key>', 'API key for Bearer token auth (use "auto" to generate)')
  .option(
    '--type-id-format <format>',
    'Type element ID format: hash | name | prefixed-name',
  )
  .option('-c, --config <path>', 'Path to config file')
  .action(async (opts) => {
    // Build partial config from CLI args
    const cliArgs: Partial<I3xConfig> = {};
    if (opts.endpoint) cliArgs.endpoint = opts.endpoint;
    if (opts.port !== undefined) cliArgs.port = opts.port;
    if (opts.host) cliArgs.host = opts.host;
    if (opts.securityMode) cliArgs.securityMode = opts.securityMode;
    if (opts.securityPolicy) cliArgs.securityPolicy = opts.securityPolicy;
    if (opts.pkiFolder) cliArgs.pkiFolder = opts.pkiFolder;
    if (opts.certificateSubject) cliArgs.certificateSubject = opts.certificateSubject;
    if (opts.optimizedClient) cliArgs.optimizedClient = opts.optimizedClient;
    if (opts.publishInterval !== undefined)
      cliArgs.publishIntervalMs = opts.publishInterval;
    if (opts.samplingInterval !== undefined)
      cliArgs.samplingIntervalMs = opts.samplingInterval;
    if (opts.logLevel) cliArgs.logLevel = opts.logLevel;
    if (opts.preload === false) cliArgs.preload = false;
    if (opts.preloadStrict) cliArgs.preloadStrict = true;
    if (opts.username) cliArgs.username = opts.username;
    if (opts.password) cliArgs.password = opts.password;
    if (opts.readOnly) cliArgs.readOnly = true;
    if (opts.experimental) cliArgs.experimental = true;
    if (opts.requireAuth === false) cliArgs.requireAuth = false;
    if (opts.apiKey) cliArgs.apiKey = opts.apiKey;
    if (opts.typeIdFormat) cliArgs.typeIdFormat = opts.typeIdFormat;

    const config = await resolveConfig(cliArgs, opts.config);
    await startServer(config, pkg.version);
  });

program.parse();
