# node-i3x

> **i3X REST server backed by OPC UA** -- built with TypeScript, node-opcua, and hexagonal DDD architecture.

An implementation of the [i3X (Industrial Information Interoperability eXchange)](https://i3x.dev) Beta API specification, translating OPC UA address spaces into a clean REST/JSON interface.

## Architecture

```
+-----------------------------------------------------------+
|                       @i3x/app                            |
|               (Composition Root / Wiring)                 |
|                                                           |
|   +--------------------+     +-------------------------+  |
|   | @i3x/rest-server   |     | @i3x/opcua-connector   |  |
|   |   Fastify routes   |     |   node-opcua client     |  |
|   |   INBOUND          |     |   OUTBOUND ADAPTER      |  |
|   +---------+----------+     +------------+------------+  |
|             |  uses ports       implements|  ports        |
|             v                             v               |
|   +---------------------------------------------------+  |
|   |                   @i3x/core                        |  |
|   |   Domain Models - Services - Port Interfaces       |  |
|   |                ZERO DEPENDENCIES                   |  |
|   +---------------------------------------------------+  |
+-----------------------------------------------------------+
```

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode (with OPC UA server)
npm run dev

# Run tests (no OPC UA server needed)
npm test

# Type checking
npm run typecheck
```

## Packages

| Package | Description |
|---------|-------------|
| `@i3x/core` | Pure domain — models, ports, services. **Zero dependencies.** |
| `@i3x/opcua-connector` | OPC UA adapter — implements `IDataSourcePort` using `node-opcua` |
| `@i3x/rest-server` | Fastify REST routes — the i3X Beta API surface |
| `@i3x/app` | Composition root — wires all packages together |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_I3X_OPCUA_ENDPOINT` | `opc.tcp://localhost:4840` | OPC UA server endpoint |
| `NODE_I3X_OPCUA_SECURITY_MODE` | `None` | Security mode (`None`, `Sign`, `SignAndEncrypt`) |
| `NODE_I3X_OPCUA_OPTIMIZED_CLIENT` | `auto` | `auto` = detect @sterfive module, `disabled` = skip |
| `NODE_I3X_PRELOAD` | `true` | Preload model on startup |
| `NODE_I3X_PRELOAD_STRICT` | `false` | Exit if model preload fails |
| `NODE_I3X_PUBLISH_INTERVAL` | `5` | Subscription polling interval |
| `NODE_I3X_LOG_LEVEL` | `info` | Log level |
| `NODE_I3X_PORT` | `8000` | HTTP server port |
| `NODE_I3X_HOST` | `127.0.0.1` | HTTP server bind address |

## 🚀 @sterfive/opcua-optimized-client

For production deployments, install the optional **[@sterfive/opcua-optimized-client](https://support.sterfive.com)** module for up to **200% performance improvement**:

- Intelligent transaction batching
- Automatic server-limit handling
- Advanced auto-healing connection logic

The module is detected automatically at startup — no code changes needed. It is listed as an `optionalDependency` in `@i3x/opcua-connector`.

> Contact [Sterfive Support](https://support.sterfive.com) for access.

## Docker

```bash
docker build -t node-i3x .
docker run -p 8000:8000 -e NODE_I3X_OPCUA_ENDPOINT=opc.tcp://host:4840 node-i3x
```

## i3X Specification

- **Official site**: [https://i3x.dev](https://i3x.dev)
- **GitHub**: [https://github.com/cesmii/i3X](https://github.com/cesmii/i3X)
- **CESMII**: [https://cesmii.org](https://cesmii.org)

## License

See LICENSE file.
