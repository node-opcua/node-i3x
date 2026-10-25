# @node-i3x/mcp

> Model Context Protocol (MCP) server for industrial automation — connect Claude, Gemini, Cursor, and Agentic AI workflows to any i3X 1.0 & OPC UA system.

[![npm version](https://img.shields.io/npm/v/@node-i3x/mcp.svg)](https://www.npmjs.com/package/@node-i3x/mcp)
[![License: AGPL-3.0 OR Commercial](https://img.shields.io/badge/license-AGPL--3.0%20%7C%20Commercial-blue)](LICENSE)
[![Built by Sterfive](https://img.shields.io/badge/built%20by-Sterfive-ff6600)](https://sterfive.com)

---

## What is `@node-i3x/mcp`?

**`@node-i3x/mcp`** is an open-source MCP server that gives AI agents (Anthropic Claude, Google Gemini, OpenAI Codex, Cursor IDE) native, structured tools to explore, diagnose, and monitor industrial machinery and factory networks.

Traditional APIs flood LLM context windows with thousands of raw nodes and require 10–20 sequential HTTP round-trips to understand a single asset. **`@node-i3x/mcp`** solves this with **5 high-value composite tools** designed for single-turn intelligence:

- 🚀 **1-Turn Complete Diagnostics**: Fetch identity, ISA-95 parent/child topology, OPC UA ObjectType schema, and live telemetry in a single call.
- 📉 **80%+ Token Reduction**: Returns structured, dense JSON summaries instead of raw, unparsed address space dumps.
- 🛡️ **Self-Correcting Address Space Traversal**: Built-in fuzzy matching automatically suggests real asset IDs if an agent mistypes an element ID.
- 🌐 **Universal Compatibility**: Connects to **ANY** standard CESMII i3X 1.0 REST Gateway server (Node.js, C#, Python, Cloud), or runs embedded in-process via `node-i3x` stack.

---

## Quickstart

### 1. Run with `npx` (No installation needed)

```bash
npx -y @node-i3x/mcp
```

By default, it connects to an i3X gateway at `http://localhost:3000`. You can configure the target server and authentication via environment variables:

```bash
I3X_SERVER_URL=https://my-plant-gateway.corp.local:8000 \
I3X_AUTH_TOKEN=secret-bearer-token \
npx -y @node-i3x/mcp
```

---

### 2. Connect Claude Desktop

Add the server to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "node-i3x": {
      "command": "npx",
      "args": ["-y", "@node-i3x/mcp"],
      "env": {
        "I3X_SERVER_URL": "http://127.0.0.1:8000",
        "I3X_AUTH_TOKEN": "your-optional-token"
      }
    }
  }
}
```

Restart Claude Desktop, and you can immediately ask:
> *"Inspect Boiler_101. Is the current temperature normal according to its schema definition?"*
> *"Explore the plant topology from root assets down 2 levels and give me a summary of any assets reporting Bad quality."*

---

### 3. Connect Cursor IDE

In Cursor Settings > Features > MCP:
1. Click **+ Add New MCP Server**
2. Name: `node-i3x`
3. Type: `command`
4. Command: `npx -y @node-i3x/mcp`

---

## High-Value MCP Tools

| Tool | Purpose | Typical Agent Prompt |
|------|---------|----------------------|
| `i3x_connect` | **Dynamic Gateway Switching**.<br/>Connects or switches to a target i3X endpoint URL and Bearer token at runtime with connection verification. | *"Connect to the Chicago plant sandbox at https://i3x-portal.sterfive.io/instance/xyz with token abc."* |
| `i3x_inspect_asset` | **Single-Turn Complete Asset Diagnostic**.<br/>Returns asset identity, ObjectType schema, sub-components, and live VQT telemetry in 1 call. Includes fuzzy suggestions on missing IDs. | *"Diagnose Pump_101. What is its current operational state and are all sub-components healthy?"* |
| `i3x_explore_plant_hierarchy` | **ISA-95 Plant Topology Traversal**.<br/>Traverses plant hierarchy from roots down to components up to `maxDepth` with cycle protection. | *"What machines and lines are configured in this factory?"* |
| `i3x_query_telemetry` | **Telemetry & Trend Analysis**.<br/>Queries current VQT or time-series history with pre-computed statistics (`min`, `max`, `mean`, `badQualityCount`). | *"Show me temperature trends for Boiler_101 over the last 2 hours. Did it exceed 85°C?"* |
| `i3x_discover_types_and_schemas` | **Type & Schema Explorer**.<br/>Searches registered ObjectTypes, RelationshipTypes, and JSON Schema field validation rules. | *"What properties and telemetry variables are required for a CNC_MillingMachine type?"* |
| `i3x_monitor_asset_events` | **Event & Alert Monitoring Stream**.<br/>Sets up subscription snapshot and alert condition filters. | *"Monitor temperature and pressure on line 4 and alert me if temperature > 80°C."* |

---

## MCP Resources

The server exposes read-only MCP resources for fast server inspection:

- `i3x://info`: Server specifications, vendor details, and supported features.
- `i3x://namespaces`: List of registered OPC UA / i3X namespace URIs and index mappings.

---

## Programmatic Usage (TypeScript / Node.js)

You can also embed `@node-i3x/mcp` directly into your custom AI agent orchestrator (LangChain, LlamaIndex, Mastra, AutoGen):

```typescript
import { NodeI3xMcpServer, RestClientBinding } from "@node-i3x/mcp";

// 1. Create binding (REST Gateway or In-Process Stack)
const binding = new RestClientBinding("http://127.0.0.1:8000", "optional-auth-token");

// 2. Instantiate MCP Server
const server = new NodeI3xMcpServer(binding);

// 3. Connect via Stdio transport
await server.startStdio();
```

---

## License

Dual-licensed under **AGPL-3.0** and **Commercial License**.  
For commercial licensing, enterprise support, and custom OPC UA/i3X integrations, visit [Sterfive.com](https://sterfive.com).
