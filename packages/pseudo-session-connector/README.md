# @node-i3x/pseudo-session-connector

> **In-process OPC UA adapter — implements `IDataSourcePort` using node-opcua `PseudoSession` for zero-network embedded mode.**

[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-ESM--only-blue)](https://www.typescriptlang.org)
[![License: AGPL-3.0-or-later OR Commercial](https://img.shields.io/badge/license-AGPL--3.0--or--later%20OR%20Commercial-orange)](../../LICENSE)
[![Built by Sterfive](https://img.shields.io/badge/built%20by-Sterfive-ff6600)](https://sterfive.com)

## Overview

This package lets you embed the i3X REST API **directly inside** a node-opcua `OPCUAServer` process. Instead of connecting via OPC UA binary transport (TCP + serialization), the adapter talks **directly to the AddressSpace in memory** — zero network overhead, microsecond latency.

## Installation

```bash
npm install @node-i3x/pseudo-session-connector
```

> Requires `@node-i3x/core` as a peer dependency.

## Usage

```typescript
import { OPCUAServer } from 'node-opcua';
import { PseudoSessionDataSourceAdapter } from '@node-i3x/pseudo-session-connector';

const server = new OPCUAServer({ port: 4840 });
await server.initialize();
// ... populate address space ...
await server.start();

// Connect i3X directly to the AddressSpace — no network!
const dataSource = new PseudoSessionDataSourceAdapter(
  server.engine.addressSpace!,
  logger,
);
await dataSource.connect();
```

## Remote vs Embedded

```
┌─ Remote (opcua-connector) ──────────────────┐
│  i3X REST → OPC UA Client → TCP → Server    │
│  Latency: milliseconds                       │
└──────────────────────────────────────────────┘

┌─ Embedded (pseudo-session-connector) ───────┐
│  i3X REST → PseudoSession → AddressSpace     │
│  Latency: microseconds  (same process)       │
└──────────────────────────────────────────────┘
```

Both implement the **same `IDataSourcePort` interface** — all domain services work identically regardless of which adapter is used.

## Subscription Strategies

### Event-based (default) — zero latency

Listens directly to `UAVariable` `value_changed` events:

```
UAVariable.setValueFromSource(...)
  └── 'value_changed' event
       └── DataChangeCallback fires immediately
```

### Polling-based — universal fallback

Periodically reads values via `PseudoSession.read()` and compares:

```
setInterval(100ms)
  └── PseudoSession.read(nodeIds)
       └── Compare with previous values
            └── DataChangeCallback fires on change
```

## Key Exports

| Export | Description |
|--------|-------------|
| `PseudoSessionDataSourceAdapter` | `IDataSourcePort` implementation for embedded mode |
| `AddressSpaceMonitoredSubscription` | Event-based subscription (listens to `value_changed`) |
| `PollingMonitoredSubscription` | Polling-based subscription (periodic `read()` + diff) |

## Dependencies

| Package | Purpose |
|---------|---------|
| `@node-i3x/core` | Domain ports and types |
| `node-opcua-address-space` | AddressSpace access |
| `node-opcua-pseudo-session` | In-process session |
| `node-opcua-data-model` | QualifiedName, NodeClass |

## Tutorial

For a complete, step-by-step guide with a full working example, see
**[TUTORIAL.md](./TUTORIAL.md)** -- a literate-programming walkthrough
that builds an OPC UA server + i3X REST API from scratch in ~80 lines.

## License

**AGPL-3.0-or-later** — Free for open-source projects.

For commercial / proprietary use, contact [Sterfive](https://sterfive.com) for a commercial license.
