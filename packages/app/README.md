# @node-i3x/app

> **Composition root — wires all i3X packages into a running application.**

This is the application entry point. It reads configuration from environment variables, instantiates the OPC UA connector, domain services, and REST server, then starts listening.

## Usage

```bash
# Development (auto-reload)
npm run dev -w packages/app

# Production
npm run start -w packages/app
```

## Configuration

Copy `.env.example` to `.env` and edit:

```bash
cp packages/app/.env.example packages/app/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `OPC_UA_ENDPOINT_URL` | `opc.tcp://localhost:4840` | OPC UA server endpoint |
| `REST_PORT` | `8080` | REST API listen port |
| `SECURITY_MODE` | `None` | OPC UA security mode |

See `.env.example` for the full list.

## Architecture

```
.env → config.ts → server.ts
                      ├── OpcUaClient + OpcUaDataSourceAdapter
                      ├── ModelService, ValueService, HistoryService
                      ├── SubscriptionService
                      └── createApp() → Fastify server
```

> **Note**: This package is `private: true` — it is deployed, not published to npm.

## License

Dual-licensed:

- **AGPL-3.0-or-later** -- you may use, modify, and distribute this software freely, provided that all derivative works and network-accessible deployments also make their complete source code available under the AGPL.
- **Sterfive Commercial License** -- allows proprietary use without copyleft obligations.

See the root [LICENSE](../../LICENSE) and [LICENSING.md](../../LICENSING.md) for details.
