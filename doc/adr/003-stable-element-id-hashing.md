# ADR 003: Stable Element ID Hashing

## Status
Approved

## Context
Clients of the i3X REST API require a stable, URL-safe identifier (`elementId`) for each asset, property, and action.
Using raw OPC UA NodeIDs (e.g., `ns=2;s=MyPump.Temperature` or `ns=4;g=123e4567-e89b-12d3-a456-426614174000`) is problematic:
1. They contain URL-unsafe characters (`;`, `=`, `,`).
2. They leak internal server implementation details (e.g., whether the ID is a string, guid, or integer).
3. Namespace indices (like `ns=2`) are highly volatile; they change depending on the order in which the OPC UA server loads NodeSets.

## Decision
We compute stable, URL-safe `elementId`s using a combination of the node's kind and the SHA-1 hash of its namespace-resolved canonical browse path:
1. We construct a namespace-independent browse path using Namespace URIs (NSU) instead of volatile indices: `nsu=http://my-uri/:BrowseName`.
2. We compute the SHA-1 hash of this canonical browse path string.
3. We take the first 16 hex characters of the hash.
4. We prefix the hash with the node kind to prevent name collisions across kinds: `{kind}-{sha1_prefix_16}` (e.g. `asset-c5e772ae33d5b3f1` or `property-96c5e772ae33d5b3`).

```typescript
// Example Implementation
const hash = crypto.createHash('sha1').update(nsuBrowsePath).digest('hex');
const elementId = `${kind}-${hash.substring(0, 16)}`;
```

## Consequences
- **Dynamic Index Immunity**: If the OPC UA server namespace array changes (e.g. the namespace index of a nodeset changes from 2 to 3), the NSU-based browse path remains identical, keeping the REST `elementId` completely stable.
- **URL-safe and Uniform**: All IDs are lowercase alphanumeric strings of consistent length, making them easy to include in URL routes and use as database keys.
- **Opaque Identifiers**: Internal OPC UA details are hidden from REST clients.
- **Lookup Requirement**: Because hashing is a one-way function, the server must maintain in-memory maps (`propertyToSource`, `actionToMethod`) during model building to resolve the original OPC UA NodeIDs when handling incoming read/write operations.
