// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  ObjectType JSON Schema Builder
// ─────────────────────────────────────────────────────────────

import type { ObjectTypeInfo, ObjectTypeMemberInfo } from '../ports/data-source.js';

// ── OPC UA → JSON Schema type mapping ────────────────────────

const DATA_TYPE_MAP: Record<string, Record<string, unknown>> = {
  // Boolean
  boolean: { type: 'boolean' },
  'i=1': { type: 'boolean' },

  // Integer types
  sbyte: { type: 'integer' },
  byte: { type: 'integer' },
  int16: { type: 'integer' },
  int32: { type: 'integer' },
  int64: { type: 'integer' },
  uint16: { type: 'integer' },
  uint32: { type: 'integer' },
  uint64: { type: 'integer' },
  'i=2': { type: 'integer' },
  'i=3': { type: 'integer' },
  'i=4': { type: 'integer' },
  'i=5': { type: 'integer' },
  'i=6': { type: 'integer' },
  'i=7': { type: 'integer' },
  'i=8': { type: 'integer' },
  'i=9': { type: 'integer' },

  // Float / Double / Number / Duration
  float: { type: 'number' },
  double: { type: 'number' },
  number: { type: 'number' },
  duration: { type: 'number' },
  'i=10': { type: 'number' },
  'i=11': { type: 'number' },
  'i=26': { type: 'number' },
  'i=290': { type: 'number' },

  // Integer types (base & uinteger)
  integer: { type: 'integer' },
  uinteger: { type: 'integer' },
  'i=27': { type: 'integer' },
  'i=28': { type: 'integer' },

  // String types
  string: { type: 'string' },
  localizedtext: { type: 'string' },
  qualifiedname: { type: 'string' },
  bytestring: { type: 'string', contentEncoding: 'base64' },
  xmlelement: { type: 'string' },
  'i=12': { type: 'string' },

  // DateTime / UtcTime
  datetime: { type: 'string', format: 'date-time' },
  utctime: { type: 'string', format: 'date-time' },
  'i=13': { type: 'string', format: 'date-time' },
  'i=294': { type: 'string', format: 'date-time' },

  // GUID / NodeId / StatusCode
  guid: { type: 'string' },
  nodeid: { type: 'string' },
  expandednodeid: { type: 'string' },
  statuscode: { type: 'integer' },
};

/**
 * Map an OPC UA data type name or NodeId to a JSON Schema type.
 *
 * Falls back to `{ type: 'string' }` for unknown types,
 * and `{ type: 'object' }` for ExtensionObject / Structure types.
 */
export function jsonSchemaForDataType(dataType: string | null): Record<string, unknown> {
  if (!dataType) return { type: 'string' };

  const normalized = dataType.toLowerCase().trim();

  // Direct lookup
  const direct = DATA_TYPE_MAP[normalized];
  if (direct) return { ...direct };

  // Try suffix match for namespace-qualified NodeIds like "ns=0;i=11"
  const nodeIdMatch = normalized.match(/i=(\d+)$/);
  if (nodeIdMatch) {
    const suffix = `i=${nodeIdMatch[1]}`;
    const byId = DATA_TYPE_MAP[suffix];
    if (byId) return { ...byId };
  }

  // Keyword-based fallback
  if (normalized.includes('boolean')) return { type: 'boolean' };
  if (
    normalized.includes('double') ||
    normalized.includes('float') ||
    normalized.includes('duration') ||
    normalized.includes('number')
  )
    return { type: 'number' };
  if (
    (normalized.includes('int') || normalized.includes('enumeration')) &&
    !normalized.includes('interval') &&
    !normalized.includes('interface')
  )
    return { type: 'integer' };
  if (normalized.includes('datetime') || normalized.includes('utctime')) {
    return { type: 'string', format: 'date-time' };
  }

  // ExtensionObject / structured type fallback
  if (normalized.includes('extensionobject') || normalized.includes('structure')) {
    return { type: 'object' };
  }

  return { type: 'string' };
}

// ── Schema builder ───────────────────────────────────────────

function schemaForMember(member: ObjectTypeMemberInfo): Record<string, unknown> {
  if (member.nodeClass === 'Object') {
    return { type: 'object', title: member.displayName };
  }
  if (member.nodeClass === 'Method') {
    return { type: 'object', title: member.displayName };
  }

  const schema = jsonSchemaForDataType(member.dataType);
  if (member.displayName && member.displayName !== member.browseName) {
    schema.title = member.displayName;
  }
  return schema;
}

/**
 * Build a JSON Schema (draft 2020-12) for an ObjectType,
 * walking the type inheritance chain.
 *
 * @param type      – the ObjectType to generate a schema for
 * @param allTypes  – all known ObjectTypes (for resolving parents)
 */
export function buildObjectTypeSchema(
  type: ObjectTypeInfo,
  allTypes: readonly ObjectTypeInfo[],
): Record<string, unknown> {
  // Build lookup by sourceNodeId
  const bySourceId = new Map<string, ObjectTypeInfo>();
  for (const t of allTypes) bySourceId.set(t.sourceNodeId, t);

  return _buildSchemaWithLookup(type, bySourceId);
}

/**
 * Build JSON Schemas for ALL object types in a single pass.
 * Builds the `bySourceId` lookup once → O(n) instead of O(n²).
 *
 * @returns Map from sourceNodeId to its JSON Schema
 */
export function buildAllObjectTypeSchemas(
  allTypes: readonly ObjectTypeInfo[],
): Map<string, Record<string, unknown>> {
  const bySourceId = new Map<string, ObjectTypeInfo>();
  for (const t of allTypes) bySourceId.set(t.sourceNodeId, t);

  const result = new Map<string, Record<string, unknown>>();
  for (const t of allTypes) {
    result.set(t.sourceNodeId, _buildSchemaWithLookup(t, bySourceId));
  }
  return result;
}

/**
 * Internal: build a schema using a pre-built lookup map.
 */
function _buildSchemaWithLookup(
  type: ObjectTypeInfo,
  bySourceId: ReadonlyMap<string, ObjectTypeInfo>,
): Record<string, unknown> {
  // Walk the inheritance chain (root-first)
  const lineage: ObjectTypeInfo[] = [];
  const seen = new Set<string>();
  let current: ObjectTypeInfo | undefined = type;
  while (current && !seen.has(current.sourceNodeId)) {
    lineage.push(current);
    seen.add(current.sourceNodeId);
    current = current.parentSourceNodeId
      ? bySourceId.get(current.parentSourceNodeId)
      : undefined;
  }
  lineage.reverse(); // root-first order

  // Merge properties from the entire lineage
  const mergedProperties: Record<string, Record<string, unknown>> = {};
  const requiredSet = new Set<string>();
  const required: string[] = [];

  for (const ancestor of lineage) {
    const members = ancestor.members ?? [];
    for (const member of members) {
      // Only include Variable members as schema properties
      if (member.nodeClass !== 'Variable') continue;

      mergedProperties[member.browseName] = schemaForMember(member);

      const rule = (member.modellingRule ?? '').toLowerCase().trim();
      if (
        (rule === 'mandatory' || rule === 'mandatoryplaceholder') &&
        !requiredSet.has(member.browseName)
      ) {
        requiredSet.add(member.browseName);
        required.push(member.browseName);
      }
    }
  }

  const schema: Record<string, unknown> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: type.displayName,
    properties: mergedProperties,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}
