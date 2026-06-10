# @node-i3x/demo-embedded

> **See i3X in action -- OPC UA + REST API in 30 seconds.**

[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-ESM--only-blue)](https://www.typescriptlang.org)
[![License: AGPL-3.0-or-later OR Commercial](https://img.shields.io/badge/license-AGPL--3.0--or--later%20OR%20Commercial-orange)](../../LICENSE)
[![Built by Sterfive](https://img.shields.io/badge/built%20by-Sterfive-ff6600)](https://sterfive.com)

<!-- TODO: Add animated terminal GIF here -->
<!-- <p align="center"><img src="./demo.gif" alt="i3X demo" width="800" /></p> -->

## Quick Start

```bash
npx @node-i3x/demo-embedded
```

That's it. In ~5 seconds you get:

- An OPC UA server with a simulated Smart Factory (Pump, Heater, Conveyor)
- i3X REST API at http://localhost:8080
- Live-updating simulated sensor values

## Try the API

```bash
# Health check
curl http://localhost:8080/health

# Server info
curl http://localhost:8080/v1/info

# List namespaces  
curl http://localhost:8080/v1/namespaces

# Browse objects
curl -X POST http://localhost:8080/v1/objects/list
```

## Live Dashboard

In a second terminal, launch the ANSI dashboard client:

```bash
npx @node-i3x/demo-embedded --client
```

Or point it at any running i3X server:

```bash
npx @node-i3x/demo-embedded --client --url http://my-server:8080
```

(Note: the --client flag is for future use; for now run the client separately with `npx tsx src/client.ts`)

## Options

| Option | Default | Description |
|---|---|---|
| `--rest-port <port>` | `8080` | REST API port |
| `--opcua-port <port>` | `48410` | OPC UA server port |
| `-h, --help` | | Show help |

## What's Inside

The demo creates a simulated Smart Factory with three assets:

| Asset | Variables | Update Rate |
|---|---|---|
| Main Coolant Pump | Temperature, Pressure, FlowRate, Running | 800ms |
| Process Heater | Temperature, HeaterOn, Setpoint, Power | 1000ms |
| Assembly Conveyor | Speed, ItemCount | 1200ms |

Values drift realistically -- temperature rises, pressure fluctuates, the heater toggles every 15 seconds.

## How It Works

This demo uses `@node-i3x/pseudo-session-connector` to wire the i3X domain services directly to the OPC UA AddressSpace in memory. No network roundtrip -- microsecond latency.

See the [Embedding Tutorial](../pseudo-session-connector/TUTORIAL.md) for a step-by-step guide.

## License

Dual-licensed:

- **AGPL-3.0-or-later** -- you may use, modify, and distribute this software
  freely, provided that all derivative works and network-accessible deployments
  also make their complete source code available under the AGPL.
- **Sterfive Commercial License** -- allows proprietary and closed-source use
  without copyleft obligations.

See [LICENSING.md](../../LICENSING.md) for details, or contact
[Sterfive](https://sterfive.com) for commercial licensing.
