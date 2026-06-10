# @node-i3x/app

> **Expose any OPC UA server as an i3X REST API -- one command.**

[![npm](https://img.shields.io/npm/v/@node-i3x/app)](https://www.npmjs.com/package/@node-i3x/app)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-ESM--only-blue)](https://www.typescriptlang.org)
[![License: AGPL-3.0-or-later OR Commercial](https://img.shields.io/badge/license-AGPL--3.0--or--later%20OR%20Commercial-orange)](../../LICENSE)
[![Built by Sterfive](https://img.shields.io/badge/built%20by-Sterfive-ff6600)](https://sterfive.com)

## Quick Start

```bash
npx @node-i3x/app -e opc.tcp://my-plc:4840
```

That's it. The i3X REST API is now available at `http://localhost:8080`.

## Installation

```bash
npm install -g @node-i3x/app
```

Or use directly with `npx` (no install needed).

## CLI Options

```
Usage: i3x [options]

Expose OPC UA servers as i3X REST APIs

Options:
  -V, --version                      Show version
  -e, --endpoint <url>               OPC UA endpoint URL
  -p, --port <port>                  REST API port (default: 8080)
  -H, --host <host>                  REST API bind address (default: 0.0.0.0)
  --security-mode <mode>             OPC UA security mode (default: None)
  --optimized-client <mode>          Optimized client: auto | disabled
  --subscription-interval <seconds>  Subscription interval in seconds
  --log-level <level>                debug | info | warn | error
  --no-model-preload                 Skip model preload on startup
  -c, --config <path>                Path to config file
  -h, --help                         Show help
```

## Configuration

i3X uses layered configuration. Each layer overrides the previous:

```
1. Built-in defaults
2. Config file (i3x.config.yml)
3. Environment variables (NODE_I3X_*)
4. CLI arguments (--endpoint, --port, ...)
```

### Config File

Create an `i3x.config.yml` in your project root:

```yaml
# i3x.config.yml
endpoint: opc.tcp://192.168.1.100:4840
port: 8080
host: 0.0.0.0
logLevel: info
subscriptionInterval: 5
modelPreload: true
```

Supported file names (auto-discovered):

| File | Format |
|---|---|
| `i3x.config.yml` | YAML |
| `i3x.config.yaml` | YAML |
| `i3x.config.json` | JSON |
| `.i3xrc` | JSON |
| `.i3xrc.json` | JSON |
| `.i3xrc.yml` | YAML |
| `package.json` (`"i3x"` key) | JSON |

### Environment Variables

All environment variables are prefixed with `NODE_I3X_`:

| Variable | Config key | Default |
|---|---|---|
| `NODE_I3X_OPCUA_ENDPOINT` | `endpoint` | `opc.tcp://localhost:4840` |
| `NODE_I3X_PORT` | `port` | `8080` |
| `NODE_I3X_HOST` | `host` | `0.0.0.0` |
| `NODE_I3X_OPCUA_SECURITY_MODE` | `securityMode` | `None` |
| `NODE_I3X_OPCUA_OPTIMIZED_CLIENT` | `optimizedClient` | `auto` |
| `NODE_I3X_PUBLISH_INTERVAL` | `subscriptionInterval` | `5` |
| `NODE_I3X_LOG_LEVEL` | `logLevel` | `info` |
| `NODE_I3X_PRELOAD` | `modelPreload` | `true` |

## Programmatic Usage

```ts
import { resolveConfig, startServer } from '@node-i3x/app';

const config = await resolveConfig({
  endpoint: 'opc.tcp://my-plc:4840',
  port: 9090,
});

await startServer(config, '1.0.0');
```

## How It Works

```
  Your OPC UA Server           i3X (@node-i3x/app)
  +-----------------+          +---------------------------+
  | AddressSpace    |  <-----> | OpcUaDataSourceAdapter    |
  | (PLCs, sensors) | opc.tcp  | ModelService              |
  +-----------------+          | ValueService              |
                               | HistoryService            |
                               | SubscriptionService       |
                               |                           |
                               | i3X REST API (Fastify)    |
                               +----------+----------------+
                                          |
                                   http://0.0.0.0:8080
                                          |
                               +----------v----------------+
                               | Your Web App / Dashboard  |
                               +---------------------------+
```

## License

Dual-licensed:

- **AGPL-3.0-or-later** -- you may use, modify, and distribute this software
  freely, provided that all derivative works and network-accessible deployments
  also make their complete source code available under the AGPL.
- **Sterfive Commercial License** -- allows proprietary and closed-source use
  without copyleft obligations.

See [LICENSING.md](../../LICENSING.md) for details, or contact
[Sterfive](https://sterfive.com) for commercial licensing.
