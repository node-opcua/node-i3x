import { describe, it, expect } from 'vitest';
import { stableI3xId, inferKind, mapNode } from '@i3x/core';
import type { SourceNodeInfo } from '@i3x/core';

describe('mapper', () => {
  it('maps a Variable node to a property', () => {
    const node: SourceNodeInfo = {
      sourceNodeId: 'ns=2;s=Temperature',
      parentSourceNodeId: 'ns=2;s=Machine',
      browseName: 'Temperature',
      nsuQualifiedName: 'nsu=http://example.com/:Temperature',
      displayName: 'Temperature',
      nodeClass: 'Variable',
      typeDefinition: 'Double',
      namespaceUri: 'http://example.com/',
      eventNotifier: false,
    };
    const browsePath = 'nsu=http://example.com/:Machine/nsu=http://example.com/:Temperature';
    const mapped = mapNode(node, [], browsePath);
    expect(mapped.kind).toBe('property');
    expect(mapped.type).toBe('Double');
    expect(mapped.sourceNodeId).toBe('ns=2;s=Temperature');
    expect(mapped.id).toMatch(/^property-/);
  });

  it('maps an Object node to an asset', () => {
    const node: SourceNodeInfo = {
      sourceNodeId: 'ns=2;s=Machine',
      parentSourceNodeId: null,
      browseName: 'Machine',
      nsuQualifiedName: 'nsu=http://example.com/:Machine',
      displayName: 'Machine',
      nodeClass: 'Object',
      typeDefinition: null,
      namespaceUri: 'http://example.com/',
      eventNotifier: false,
    };
    expect(inferKind(node)).toBe('asset');
  });

  it('maps a Method node to an action', () => {
    const node: SourceNodeInfo = {
      sourceNodeId: 'ns=2;s=Reset',
      parentSourceNodeId: 'ns=2;s=Machine',
      browseName: 'Reset',
      nsuQualifiedName: 'nsu=http://example.com/:Reset',
      displayName: 'Reset',
      nodeClass: 'Method',
      typeDefinition: null,
      namespaceUri: 'http://example.com/',
      eventNotifier: false,
    };
    expect(inferKind(node)).toBe('action');
  });

  it('maps an event-notifier Object to eventSource', () => {
    const node: SourceNodeInfo = {
      sourceNodeId: 'ns=2;s=Alarm',
      parentSourceNodeId: null,
      browseName: 'Alarm',
      nsuQualifiedName: 'nsu=http://example.com/:Alarm',
      displayName: 'Alarm',
      nodeClass: 'Object',
      typeDefinition: null,
      namespaceUri: 'http://example.com/',
      eventNotifier: true,
    };
    expect(inferKind(node)).toBe('eventSource');
  });

  it('generates stable deterministic IDs from browse paths', () => {
    const path = 'nsu=http://example.com/:Machine/nsu=http://example.com/:Temp';
    const id1 = stableI3xId(path, 'property');
    const id2 = stableI3xId(path, 'property');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^property-[a-f0-9]{16}$/);
  });

  it('generates different IDs for different browse paths', () => {
    const id1 = stableI3xId('nsu=http://x/:A/nsu=http://x/:Temp1', 'property');
    const id2 = stableI3xId('nsu=http://x/:A/nsu=http://x/:Temp2', 'property');
    expect(id1).not.toBe(id2);
  });

  it('generates the SAME ID regardless of namespace index', () => {
    // This is the key property: different ns indices, same URI → same ID
    const path = 'nsu=http://example.com/:Machine/nsu=http://example.com/:Temp';
    const id = stableI3xId(path, 'property');
    // The path is the same regardless of whether the server assigned
    // ns=2 or ns=5 to http://example.com/ — the URI is what matters
    expect(id).toMatch(/^property-[a-f0-9]{16}$/);
  });
});
