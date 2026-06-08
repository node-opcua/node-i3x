import { describe, it, expect } from 'vitest';
import { stableI3xId, inferKind, mapNode } from '@i3x/core';
import type { SourceNodeInfo } from '@i3x/core';

describe('mapper', () => {
  it('maps a Variable node to a property', () => {
    const node: SourceNodeInfo = {
      sourceNodeId: 'ns=2;s=Temperature',
      parentSourceNodeId: 'ns=2;s=Machine',
      browseName: 'Temperature',
      displayName: 'Temperature',
      nodeClass: 'Variable',
      dataType: 'Double',
      eventNotifier: false,
    };
    const mapped = mapNode(node, []);
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
      displayName: 'Machine',
      nodeClass: 'Object',
      dataType: null,
      eventNotifier: false,
    };
    expect(inferKind(node)).toBe('asset');
  });

  it('maps a Method node to an action', () => {
    const node: SourceNodeInfo = {
      sourceNodeId: 'ns=2;s=Reset',
      parentSourceNodeId: 'ns=2;s=Machine',
      browseName: 'Reset',
      displayName: 'Reset',
      nodeClass: 'Method',
      dataType: null,
      eventNotifier: false,
    };
    expect(inferKind(node)).toBe('action');
  });

  it('maps an event-notifier Object to eventSource', () => {
    const node: SourceNodeInfo = {
      sourceNodeId: 'ns=2;s=Alarm',
      parentSourceNodeId: null,
      browseName: 'Alarm',
      displayName: 'Alarm',
      nodeClass: 'Object',
      dataType: null,
      eventNotifier: true,
    };
    expect(inferKind(node)).toBe('eventSource');
  });

  it('generates stable deterministic IDs', () => {
    const id1 = stableI3xId('ns=2;s=Temp', 'property');
    const id2 = stableI3xId('ns=2;s=Temp', 'property');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^property-[a-f0-9]{16}$/);
  });

  it('generates different IDs for different sources', () => {
    const id1 = stableI3xId('ns=2;s=Temp1', 'property');
    const id2 = stableI3xId('ns=2;s=Temp2', 'property');
    expect(id1).not.toBe(id2);
  });
});
