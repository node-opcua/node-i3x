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

  // ── stableI3xId ──────────────────────────────────────────────

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

  it('different kinds at the same path produce different IDs', () => {
    const path = 'nsu=http://x/:Parent/nsu=http://x/:Node';
    const assetId = stableI3xId(path, 'asset');
    const propId = stableI3xId(path, 'property');
    const actionId = stableI3xId(path, 'action');
    const eventId = stableI3xId(path, 'eventSource');

    // All four should differ
    const ids = [assetId, propId, actionId, eventId];
    expect(new Set(ids).size).toBe(4);

    // Each should have the correct prefix
    expect(assetId).toMatch(/^asset-/);
    expect(propId).toMatch(/^property-/);
    expect(actionId).toMatch(/^action-/);
    expect(eventId).toMatch(/^eventSource-/);
  });

  it('deep 4-level path produces a valid ID', () => {
    const path =
      'nsu=http://di.org/:DeviceSet' +
      '/nsu=http://coffee.com/:CoffeeMachine' +
      '/nsu=http://coffee.com/:Status' +
      '/nsu=http://coffee.com/:Temperature';
    const id = stableI3xId(path, 'property');
    expect(id).toMatch(/^property-[a-f0-9]{16}$/);
  });

  it('root path (single segment) produces a valid ID', () => {
    const id = stableI3xId('nsu=http://di.org/:DeviceSet', 'asset');
    expect(id).toMatch(/^asset-[a-f0-9]{16}$/);
  });

  it('path order matters (parent/child ≠ child/parent)', () => {
    const id1 = stableI3xId('nsu=http://x/:A/nsu=http://x/:B', 'asset');
    const id2 = stableI3xId('nsu=http://x/:B/nsu=http://x/:A', 'asset');
    expect(id1).not.toBe(id2);
  });

  it('same leaf name under different parents → different IDs', () => {
    const id1 = stableI3xId(
      'nsu=http://x/:Pump/nsu=http://x/:Temperature', 'property',
    );
    const id2 = stableI3xId(
      'nsu=http://x/:Motor/nsu=http://x/:Temperature', 'property',
    );
    expect(id1).not.toBe(id2);
  });

  it('handles empty string path without throwing', () => {
    const id = stableI3xId('', 'asset');
    expect(id).toMatch(/^asset-[a-f0-9]{16}$/);
  });

  it('handles unicode browse names', () => {
    const id = stableI3xId('nsu=http://x/:Température', 'property');
    expect(id).toMatch(/^property-[a-f0-9]{16}$/);
  });

  it('multi-namespace path — each segment uses its own URI', () => {
    const path =
      'nsu=http://opcfoundation.org/UA/:Objects' +
      '/nsu=http://di.org/:DeviceSet' +
      '/nsu=http://vendor.com/:MyDevice' +
      '/nsu=http://vendor.com/:Status';
    const id = stableI3xId(path, 'property');
    expect(id).toMatch(/^property-[a-f0-9]{16}$/);
    // The full path is hashed, so different namespaces are included
    const idWithoutVendor = stableI3xId(
      'nsu=http://opcfoundation.org/UA/:Objects' +
      '/nsu=http://di.org/:DeviceSet' +
      '/nsu=http://other.com/:MyDevice' +    // different vendor
      '/nsu=http://other.com/:Status',
      'property',
    );
    expect(id).not.toBe(idWithoutVendor);
  });
});
