// ─────────────────────────────────────────────────────────────
// @node-i3x/core — schema-builder unit tests
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import type { ObjectTypeInfo, ObjectTypeMemberInfo } from '../src/ports/data-source.js';
import {
  buildAllObjectTypeSchemas,
  buildObjectTypeSchema,
} from '../src/services/schema-builder.js';

function member(overrides: Partial<ObjectTypeMemberInfo> = {}): ObjectTypeMemberInfo {
  return {
    browseName: 'Prop',
    displayName: 'Prop',
    nodeClass: 'Variable',
    dataType: 'Double',
    modellingRule: null,
    ...overrides,
  };
}

function objectType(overrides: Partial<ObjectTypeInfo> = {}): ObjectTypeInfo {
  return {
    sourceNodeId: 'ns=0;i=1000',
    parentSourceNodeId: null,
    browseName: 'TestType',
    displayName: 'Test Type',
    namespaceUri: 'http://test.com/',
    members: [],
    ...overrides,
  };
}

describe('schema-builder', () => {
  // ── Basic schema structure ─────────────────────────────────

  it('produces a JSON Schema 2020-12 skeleton', () => {
    const type = objectType();
    const schema = buildObjectTypeSchema(type, [type]);
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.title).toBe('Test Type');
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined(); // no required members
  });

  // ── Data type mapping ──────────────────────────────────────

  it('maps Boolean data type', () => {
    const type = objectType({
      members: [
        member({ browseName: 'IsReady', displayName: 'IsReady', dataType: 'Boolean' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.IsReady.type).toBe('boolean');
  });

  it('maps Double data type to number', () => {
    const type = objectType({
      members: [member({ browseName: 'Temp', displayName: 'Temp', dataType: 'Double' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Temp.type).toBe('number');
  });

  it('maps Int32 data type to integer', () => {
    const type = objectType({
      members: [member({ browseName: 'Count', displayName: 'Count', dataType: 'Int32' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Count.type).toBe('integer');
  });

  it('maps String data type', () => {
    const type = objectType({
      members: [member({ browseName: 'Name', displayName: 'Name', dataType: 'String' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Name.type).toBe('string');
  });

  it('maps DateTime to string with date-time format', () => {
    const type = objectType({
      members: [member({ browseName: 'Ts', displayName: 'Ts', dataType: 'DateTime' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Ts.type).toBe('string');
    expect(props.Ts.format).toBe('date-time');
  });

  it('maps ByteString to string with base64 encoding', () => {
    const type = objectType({
      members: [
        member({ browseName: 'Blob', displayName: 'Blob', dataType: 'ByteString' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Blob.type).toBe('string');
    expect(props.Blob.contentEncoding).toBe('base64');
  });

  it('maps NodeId i=1 to boolean', () => {
    const type = objectType({
      members: [member({ browseName: 'X', displayName: 'X', dataType: 'i=1' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('boolean');
  });

  it('maps ns-qualified NodeId like ns=0;i=11 to number', () => {
    const type = objectType({
      members: [member({ browseName: 'V', displayName: 'V', dataType: 'ns=0;i=11' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.V.type).toBe('number');
  });

  it('maps Duration data type (i=290) to number', () => {
    const type = objectType({
      members: [member({ browseName: 'Dur', displayName: 'Dur', dataType: 'i=290' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Dur.type).toBe('number');
  });

  it('maps UtcTime data type (i=294) to string with date-time format', () => {
    const type = objectType({
      members: [member({ browseName: 'Utc', displayName: 'Utc', dataType: 'i=294' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Utc.type).toBe('string');
    expect(props.Utc.format).toBe('date-time');
  });

  it('maps Number data type (i=26) to number', () => {
    const type = objectType({
      members: [member({ browseName: 'Num', displayName: 'Num', dataType: 'i=26' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Num.type).toBe('number');
  });

  it('maps Integer data type (i=27) to integer', () => {
    const type = objectType({
      members: [member({ browseName: 'Int', displayName: 'Int', dataType: 'i=27' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Int.type).toBe('integer');
  });

  it('maps UInteger data type (i=28) to integer', () => {
    const type = objectType({
      members: [member({ browseName: 'UInt', displayName: 'UInt', dataType: 'i=28' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.UInt.type).toBe('integer');
  });

  it('falls back to string for unknown data types', () => {
    const type = objectType({
      members: [
        member({ browseName: 'X', displayName: 'X', dataType: 'SomeCustomType' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('string');
  });

  it('falls back to string for null data type', () => {
    const type = objectType({
      members: [member({ browseName: 'X', displayName: 'X', dataType: null })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('string');
  });

  it('maps ExtensionObject to object', () => {
    const type = objectType({
      members: [
        member({ browseName: 'Ext', displayName: 'Ext', dataType: 'ExtensionObject' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Ext.type).toBe('object');
  });

  it('maps Structure to object', () => {
    const type = objectType({
      members: [member({ browseName: 'S', displayName: 'S', dataType: 'Structure' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.S.type).toBe('object');
  });

  // ── Keyword-based fallbacks ────────────────────────────────

  it('keyword fallback: "MyBoolean" maps to boolean', () => {
    const type = objectType({
      members: [member({ browseName: 'X', displayName: 'X', dataType: 'MyBooleanType' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('boolean');
  });

  it('keyword fallback: "MyDouble" maps to number', () => {
    const type = objectType({
      members: [member({ browseName: 'X', displayName: 'X', dataType: 'MyDoubleType' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('number');
  });

  it('keyword fallback: "MyFloat" maps to number', () => {
    const type = objectType({
      members: [
        member({ browseName: 'X', displayName: 'X', dataType: 'MyFloatPrecision' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('number');
  });

  it('keyword fallback: "MyIntCounter" maps to integer', () => {
    const type = objectType({
      members: [member({ browseName: 'X', displayName: 'X', dataType: 'MyIntCounter' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('integer');
  });

  it('keyword fallback: "Interval" does NOT map to integer', () => {
    const type = objectType({
      members: [member({ browseName: 'X', displayName: 'X', dataType: 'Interval' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('string'); // fallback
  });

  it('keyword fallback: "Interface" does NOT map to integer', () => {
    const type = objectType({
      members: [member({ browseName: 'X', displayName: 'X', dataType: 'Interface' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('string'); // fallback
  });

  it('keyword fallback: "MyDateTime" maps to date-time string', () => {
    const type = objectType({
      members: [
        member({ browseName: 'X', displayName: 'X', dataType: 'MyDateTimeField' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('string');
    expect(props.X.format).toBe('date-time');
  });

  it('keyword fallback: "MyDuration" maps to number', () => {
    const type = objectType({
      members: [
        member({ browseName: 'X', displayName: 'X', dataType: 'MyDurationType' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('number');
  });

  it('keyword fallback: "MyUtcTime" maps to date-time string', () => {
    const type = objectType({
      members: [member({ browseName: 'X', displayName: 'X', dataType: 'MyUtcTime' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('string');
    expect(props.X.format).toBe('date-time');
  });

  it('keyword fallback: "MyEnumeration" maps to integer', () => {
    const type = objectType({
      members: [
        member({ browseName: 'X', displayName: 'X', dataType: 'MyEnumerationType' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.X.type).toBe('integer');
  });

  // ── Member nodeClass filtering ─────────────────────────────

  it('skips Object nodeClass members (they are not schema properties)', () => {
    const type = objectType({
      members: [
        member({
          browseName: 'SubObj',
          displayName: 'SubObj',
          nodeClass: 'Object',
          dataType: null,
        }),
        member({
          browseName: 'Temp',
          displayName: 'Temp',
          nodeClass: 'Variable',
          dataType: 'Double',
        }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    // Object members are skipped — only Variable members become properties
    expect(props.SubObj).toBeUndefined();
    expect(props.Temp).toBeDefined();
    expect(props.Temp.type).toBe('number');
  });

  it('skips Method nodeClass members', () => {
    const type = objectType({
      members: [
        member({
          browseName: 'DoReset',
          displayName: 'Reset',
          nodeClass: 'Method',
          dataType: null,
        }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.DoReset).toBeUndefined();
  });

  // ── displayName vs browseName → title ──────────────────────

  it('adds title when displayName differs from browseName', () => {
    const type = objectType({
      members: [
        member({ browseName: 'Temp', displayName: 'Temperature', dataType: 'Double' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Temp.title).toBe('Temperature');
  });

  it('omits title when displayName equals browseName', () => {
    const type = objectType({
      members: [member({ browseName: 'Temp', displayName: 'Temp', dataType: 'Double' })],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.Temp.title).toBeUndefined();
  });

  // ── Modelling rules → required ─────────────────────────────

  it('marks Mandatory members as required', () => {
    const type = objectType({
      members: [
        member({ browseName: 'A', displayName: 'A', modellingRule: 'Mandatory' }),
        member({ browseName: 'B', displayName: 'B', modellingRule: 'Optional' }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    expect(schema.required).toEqual(['A']);
  });

  it('marks MandatoryPlaceholder members as required', () => {
    const type = objectType({
      members: [
        member({
          browseName: 'X',
          displayName: 'X',
          modellingRule: 'MandatoryPlaceholder',
        }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    expect(schema.required).toEqual(['X']);
  });

  it('omits required when all members are Optional', () => {
    const type = objectType({
      members: [
        member({ browseName: 'A', displayName: 'A', modellingRule: 'Optional' }),
        member({ browseName: 'B', displayName: 'B', modellingRule: null }),
      ],
    });
    const schema = buildObjectTypeSchema(type, [type]);
    expect(schema.required).toBeUndefined();
  });

  // ── Inheritance chain ──────────────────────────────────────

  it('merges properties from parent type', () => {
    const parent = objectType({
      sourceNodeId: 'ns=0;i=100',
      browseName: 'BaseType',
      displayName: 'Base Type',
      members: [
        member({
          browseName: 'ParentProp',
          displayName: 'ParentProp',
          dataType: 'String',
        }),
      ],
    });
    const child = objectType({
      sourceNodeId: 'ns=0;i=200',
      parentSourceNodeId: 'ns=0;i=100',
      browseName: 'ChildType',
      displayName: 'Child Type',
      members: [
        member({
          browseName: 'ChildProp',
          displayName: 'ChildProp',
          dataType: 'Boolean',
        }),
      ],
    });
    const allTypes = [parent, child];
    const schema = buildObjectTypeSchema(child, allTypes);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.ParentProp).toBeDefined();
    expect(props.ParentProp.type).toBe('string');
    expect(props.ChildProp).toBeDefined();
    expect(props.ChildProp.type).toBe('boolean');
    expect(schema.title).toBe('Child Type');
  });

  it('child overrides parent property with same browseName', () => {
    const parent = objectType({
      sourceNodeId: 'ns=0;i=100',
      members: [member({ browseName: 'Val', displayName: 'Val', dataType: 'String' })],
    });
    const child = objectType({
      sourceNodeId: 'ns=0;i=200',
      parentSourceNodeId: 'ns=0;i=100',
      members: [member({ browseName: 'Val', displayName: 'Val', dataType: 'Double' })],
    });
    const schema = buildObjectTypeSchema(child, [parent, child]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    // Child's definition should overwrite the parent's
    expect(props.Val.type).toBe('number');
  });

  it('handles circular inheritance gracefully', () => {
    const typeA = objectType({
      sourceNodeId: 'ns=0;i=100',
      parentSourceNodeId: 'ns=0;i=200',
      members: [member({ browseName: 'A', displayName: 'A' })],
    });
    const typeB = objectType({
      sourceNodeId: 'ns=0;i=200',
      parentSourceNodeId: 'ns=0;i=100',
      members: [member({ browseName: 'B', displayName: 'B' })],
    });
    // Should not infinite-loop
    const schema = buildObjectTypeSchema(typeA, [typeA, typeB]);
    expect(schema.type).toBe('object');
  });

  // ── Type with no members ──────────────────────────────────

  it('handles type with undefined members', () => {
    const type = objectType({ members: undefined });
    const schema = buildObjectTypeSchema(type, [type]);
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });

  // ── buildAllObjectTypeSchemas ──────────────────────────────

  it('builds schemas for all types in a single pass', () => {
    const parent = objectType({
      sourceNodeId: 'ns=0;i=100',
      displayName: 'Parent',
      members: [member({ browseName: 'PP', displayName: 'PP', dataType: 'String' })],
    });
    const child = objectType({
      sourceNodeId: 'ns=0;i=200',
      parentSourceNodeId: 'ns=0;i=100',
      displayName: 'Child',
      members: [member({ browseName: 'CP', displayName: 'CP', dataType: 'Int32' })],
    });
    const allTypes = [parent, child];
    const allSchemas = buildAllObjectTypeSchemas(allTypes);

    expect(allSchemas.size).toBe(2);

    const parentSchema = allSchemas.get('ns=0;i=100')!;
    expect(parentSchema.title).toBe('Parent');
    const parentProps = parentSchema.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(parentProps.PP).toBeDefined();
    expect(parentProps.CP).toBeUndefined();

    const childSchema = allSchemas.get('ns=0;i=200')!;
    expect(childSchema.title).toBe('Child');
    const childProps = childSchema.properties as Record<string, Record<string, unknown>>;
    expect(childProps.PP).toBeDefined(); // inherited
    expect(childProps.CP).toBeDefined();
  });

  it('required is not duplicated across inheritance chain', () => {
    const parent = objectType({
      sourceNodeId: 'ns=0;i=100',
      members: [
        member({ browseName: 'X', displayName: 'X', modellingRule: 'Mandatory' }),
      ],
    });
    const child = objectType({
      sourceNodeId: 'ns=0;i=200',
      parentSourceNodeId: 'ns=0;i=100',
      // Re-declares X as Mandatory — should not duplicate in required[]
      members: [
        member({ browseName: 'X', displayName: 'X', modellingRule: 'Mandatory' }),
      ],
    });
    const schema = buildObjectTypeSchema(child, [parent, child]);
    expect(schema.required).toEqual(['X']);
  });
});
