# i3X Embedded Demo — PseudoSession Connector

> **OPC UA server + i3X REST API in a single process, with zero network overhead.**

This demo shows how to embed the i3X REST server **directly inside** a node-opcua `OPCUAServer` using `@node-i3x/pseudo-session-connector`. Instead of connecting via OPC UA binary transport (TCP + serialization), the i3X adapter talks **directly to the AddressSpace in memory**.

## Quick Start

**Terminal 1 — Start the server:**

```bash
npm run demo -w packages/demo-embedded
```

**Terminal 2 — Run the REST client dashboard:**

```bash
npm run client -w packages/demo-embedded
```

The client will:
1. Discover the full i3X model (assets, properties, tree)
2. Read current values for all assets
3. Display a live dashboard with refreshing cards showing temperature, pressure, heater on/off, etc.

Then test the endpoints manually:

```bash
# Health check
curl http://localhost:8080/health

# Server info
curl http://localhost:8080/v1/info

# Namespace list
curl http://localhost:8080/v1/namespaces

# Object list (POST with JSON body)
curl -X POST http://localhost:8080/v1/objects/list \
  -H 'Content-Type: application/json' \
  -d '{"elementIds":[]}'
```

<details>
<summary>PowerShell equivalents</summary>

```powershell
Invoke-RestMethod http://localhost:8080/health
Invoke-RestMethod http://localhost:8080/v1/info
Invoke-RestMethod http://localhost:8080/v1/namespaces

Invoke-RestMethod http://localhost:8080/v1/objects/list `
  -Method POST -ContentType 'application/json' `
  -Body '{"elementIds":[]}'
```

</details>

## How It Works

### The Traditional Way (Remote OPC UA Client)

```
+-------------+    TCP/Binary     +---------------+
|  i3X REST   | --------------->  |  OPC UA       |
|  Server     |  OPC UA Protocol  |  Server       |
|             | <---------------  |               |
+-------------+    Serialize/     +---------------+
                   Deserialize
```

```typescript
// 6 lines — client, session, TCP connection
const client = new OpcUaClient({
  endpointUrl: 'opc.tcp://localhost:4840',
  securityMode: 'None',
}, logger);
const dataSource = new OpcUaDataSourceAdapter(client, logger);
await dataSource.connect();
```

### The Embedded Way (PseudoSession)

```
+---------------------------------------+
|           Single Process              |
|                                       |
|  i3X REST --> PseudoSession --> AddressSpace
|  Server        (in-memory)            |
|                                       |
+---------------------------------------+
```

```typescript
// 3 lines — direct AddressSpace access, no network
const dataSource = new PseudoSessionDataSourceAdapter(
  server.engine.addressSpace!, logger,
);
await dataSource.connect();
```

**That's it.** Everything downstream (domain services, REST routes, subscriptions) is identical.

## The Key Code

Here's the complete wiring — see how simple it is:

```typescript
import { OPCUAServer } from 'node-opcua';
import { ModelService, ValueService, /* ... */ } from '@node-i3x/core';
import { PseudoSessionDataSourceAdapter } from '@node-i3x/pseudo-session-connector';
import { createApp } from '@node-i3x/rest-server';

// 1. Create your OPC UA server (with your address space)
const server = new OPCUAServer({ port: 4840 });
await server.initialize();
// ... add nodes to server.engine.addressSpace ...
await server.start();

// 2. Connect i3X directly to the AddressSpace
const dataSource = new PseudoSessionDataSourceAdapter(
  server.engine.addressSpace!, logger,
);
await dataSource.connect();

// 3. Wire up domain services (same as remote mode)
const modelService = new ModelService(dataSource, logger);
const valueService = new ValueService(dataSource, modelService, logger);

// 4. Start REST API
const app = await createApp({
  dataSource, modelService, valueService, /* ... */
});
await app.listen({ port: 8080 });
```

## Benefits

| Feature | Remote (OPC UA Client) | Embedded (PseudoSession) |
|---------|----------------------|--------------------------|
| Network round-trip | TCP + binary encoding | None — in-process calls |
| Latency | Milliseconds | Microseconds |
| Serialization | Full OPC UA binary protocol | None |
| Deployment | Two processes | Single process |
| Subscriptions | OPC UA protocol | `UAVariable.on('value_changed')` |
| Extra dependencies | `node-opcua-client` | `node-opcua-address-space` |

## Subscription Support

The PseudoSession connector supports two subscription strategies:

### Event-based (default) — zero latency

```
UAVariable.setValueFromSource(...)
  +-- 'value_changed' event
       +-- DataChangeCallback fires immediately
```

### Polling-based — works with any session

```
setInterval(100ms)
  +-- PseudoSession.read(nodeIds)
       +-- Compare with previous values
            +-- DataChangeCallback fires on change
```

## Running the Comparison Demo

```bash
# Embedded mode (PseudoSession — no network)
npm run demo -w packages/demo-embedded

# Remote mode (OPC UA binary transport)
npm run demo:remote -w packages/demo-embedded
```

Both serve the same REST API at `http://localhost:8080` — the difference is the transport layer.

## Architecture

```
@node-i3x/pseudo-session-connector
|-- PseudoSessionDataSourceAdapter   # implements IDataSourcePort
|   |-- browse()     -> PseudoSession.browse()
|   |-- read()       -> PseudoSession.read()
|   |-- write()      -> PseudoSession.write()  (auto DataType)
|   |-- call()       -> PseudoSession.call()
|   +-- subscribe()  -> AddressSpaceMonitoredSubscription
|
|-- AddressSpaceMonitoredSubscription  # event-based
|   +-- UAVariable.on('value_changed', handler)
|
+-- PollingMonitoredSubscription       # polling-based
    +-- setInterval + IBasicSession.read()
```

The `PseudoSessionDataSourceAdapter` implements the same `IDataSourcePort` interface as `OpcUaDataSourceAdapter` — the domain services don't know or care which one is active.
