# Epic: Command Invocation (OPC UA Method Calls)

> **Status**: 📋 Backlog — Not in i3X Beta spec yet  
> **Priority**: Medium  
> **Created**: 2026-06-09  

## Summary

Enable i3X clients to invoke **commands** (OPC UA Method calls)
through the REST API. OPC UA Methods are already discovered during
model build and tracked as `kind: 'action'` nodes, but there is no
REST endpoint to invoke them.

## Motivation

Many OPC UA servers expose Methods on Objects for operations like
`Start`, `Stop`, `Reset`, `Brew`, etc. The i3X explorer and other
clients need to call these methods with typed input arguments and
receive the output arguments.

## What Already Exists

| Layer | Component | Status |
|-------|-----------|--------|
| Domain model | `NodeKind = 'action'` | ✅ Done |
| Domain model | `BuildResult.actionToMethod` map | ✅ Done |
| Mapper | OPC UA `Method` → i3X `action` kind | ✅ Done |
| Model build | Actions discovered, `[objectNodeId, methodNodeId]` pairs stored | ✅ Done |
| OPC UA client | `OpcUaClient.callMethod(objectNodeId, methodNodeId, args)` | ✅ Done (basic) |

## What's Missing

### 1. REST Endpoint

Design a new endpoint for invoking actions. Proposed:

```
POST /v1/objects/{elementId}/invoke
```

**Request body:**
```json
{
  "inputArguments": [
    { "value": 95.5, "dataType": "Double" },
    { "value": "Espresso", "dataType": "String" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "statusCode": 0,
    "outputArguments": [
      { "value": true, "dataType": "Boolean" }
    ]
  }
}
```

> [!IMPORTANT]
> The i3X Beta spec does NOT define a command endpoint.
> This would be a **custom extension** until the spec adds it.
> Design should be forward-compatible with a future spec addition.

### 2. Hexagonal Port — `IDataSourcePort.callMethod()`

Add to `packages/core/src/ports/data-source.ts`:

```typescript
callMethod(
  objectNodeId: string,
  methodNodeId: string,
  inputArguments: MethodArgument[],
): Promise<MethodCallResult>;
```

### 3. Adapter Delegation

`OpcUaDataSourceAdapter` must delegate to `OpcUaClient.callMethod()`
with proper argument type coercion.

### 4. ActionService

New service in `packages/core/src/services/action-service.ts`:

- Resolve `elementId` → `[objectNodeId, methodNodeId]` via
  `model.actionToMethod`
- Validate input arguments against the method's argument schema
- Call `dataSource.callMethod()`
- Format the result

### 5. Argument Type Coercion

The current `OpcUaClient.callMethod()` uses `DataType.Null` for all
input arguments. This needs proper OPC UA DataType mapping:

| i3X type | OPC UA DataType |
|----------|----------------|
| `"Boolean"` | `DataType.Boolean` |
| `"Int32"` | `DataType.Int32` |
| `"UInt32"` | `DataType.UInt32` |
| `"Float"` | `DataType.Float` |
| `"Double"` | `DataType.Double` |
| `"String"` | `DataType.String` |
| `"DateTime"` | `DataType.DateTime` |
| `"ByteString"` | `DataType.ByteString` |
| `"NodeId"` | `DataType.NodeId` |

### 6. Input/Output Argument Discovery

OPC UA Method nodes have `InputArguments` and `OutputArguments`
properties (Variable children with DataType = `Argument[]`).
These should be browsed and exposed so clients can:

- Discover what arguments a method accepts
- Display a form in the explorer
- Validate arguments before calling

Proposed endpoint:

```
GET /v1/objects/{elementId}/schema
```

Returns the input/output argument definitions with names, types,
descriptions, and value ranks.

### 7. ServerCapabilities Extension

Add a `commands` capability to `/v1/info`:

```json
{
  "capabilities": {
    "query": { "history": true },
    "update": { "current": true, "history": false },
    "subscribe": { "stream": true },
    "commands": { "invoke": true }
  }
}
```

## OPC UA CallMethod Flow

```
┌─────────┐       ┌──────────────┐       ┌────────────┐
│  Client  │──────▶│  i3X Server  │──────▶│  OPC UA    │
│          │       │              │       │  Server    │
│ POST     │       │ ActionService│       │            │
│ /invoke  │       │  resolves    │       │ session    │
│          │       │  elementId → │       │  .call()   │
│ input    │       │  objectId +  │       │            │
│ args     │       │  methodId    │       │ input      │
│          │       │              │       │ Arguments  │
│          │◀──────│  formats     │◀──────│            │
│ output   │       │  result      │       │ output     │
│ args     │       │              │       │ Arguments  │
└─────────┘       └──────────────┘       └────────────┘
```

## Files to Create/Modify

| File | Change |
|------|--------|
| `packages/core/src/ports/data-source.ts` | Add `callMethod()` + types |
| `packages/core/src/services/action-service.ts` | **[NEW]** ActionService |
| `packages/core/src/index.ts` | Export ActionService |
| `packages/opcua-connector/src/opcua-client.ts` | Fix argument coercion |
| `packages/opcua-connector/src/opcua-adapter.ts` | Delegate `callMethod` |
| `packages/rest-server/src/routes/actions.ts` | **[NEW]** Route handler |
| `packages/rest-server/src/app.ts` | Register actions route |
| `packages/rest-server/src/routes/info.ts` | Add `commands` capability |
| `packages/app/src/server.ts` | Wire ActionService |

## Acceptance Criteria

- [ ] `POST /v1/objects/{elementId}/invoke` calls the OPC UA method
- [ ] Input arguments are properly typed (not `DataType.Null`)
- [ ] Output arguments are returned in the response
- [ ] Unknown elementId returns 404
- [ ] Non-action elementId returns 400
- [ ] Method failure returns the OPC UA status code
- [ ] `GET /v1/objects/{elementId}/schema` returns argument definitions
- [ ] `/v1/info` reports `commands.invoke: true`
- [ ] E2E test with the CoffeeMachine `Brew` method
- [ ] Unit tests for ActionService

## Open Questions

1. Should we wait for the i3X spec to define a command endpoint,
   or implement our own extension now?
2. Should the endpoint be `POST /v1/objects/{elementId}/invoke` or
   `POST /v1/commands/invoke` with elementId in the body?
3. How to handle complex/structured input argument types
   (e.g. `ExtensionObject`)?
4. Should argument schema discovery be a separate endpoint or
   included in `/objects/list` response for action nodes?
