#!/usr/bin/env node
import { createRequire } from 'node:module';
import { RestClientBinding } from './bindings/rest-binding.js';
import { NodeI3xMcpServer } from './server.js';

const args = process.argv.slice(2);

// Check flags
if (args.includes('--help') || args.includes('-h')) {
  console.error(`
Usage: node-i3x-mcp [options]

Model Context Protocol (MCP) server for industrial automation (i3X & OPC UA).

Options:
  --url <url>      Target i3X Gateway REST URL (default: http://localhost:3000)
  --token <token>  Optional Bearer authentication token
  --help, -h       Show this help message
  --version, -v    Show version number

Environment Variables:
  I3X_SERVER_URL   Target i3X Gateway REST URL (alias: I3X_BASE_URL)
  I3X_AUTH_TOKEN   Optional Bearer authentication token
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const { version } = createRequire(import.meta.url)('../package.json') as {
    version: string;
  };
  console.log(version);
  process.exit(0);
}

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

const targetUrl =
  getArgValue('--url') ||
  process.env.I3X_SERVER_URL ||
  process.env.I3X_BASE_URL ||
  'http://localhost:3000';

const authToken = getArgValue('--token') || process.env.I3X_AUTH_TOKEN;

const binding = new RestClientBinding(targetUrl, authToken);
const mcpServer = new NodeI3xMcpServer(binding);

// Handle graceful termination
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

mcpServer.startStdio().catch((err) => {
  console.error('Fatal error starting @node-i3x/mcp server:', err);
  process.exit(1);
});
