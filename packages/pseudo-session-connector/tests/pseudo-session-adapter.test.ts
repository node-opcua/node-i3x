// ─────────────────────────────────────────────────────────────
// TDD tests for PseudoSessionDataSourceAdapter
// ─────────────────────────────────────────────────────────────

import { consoleLogger } from '@node-i3x/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PseudoSessionDataSourceAdapter } from '../src/pseudo-session-adapter.js';
import {
  createTestContext,
  type TestContext,
  teardownTestContext,
} from './helpers/create-test-context.js';

describe('PseudoSessionDataSourceAdapter', () => {
  let ctx: TestContext;
  let adapter: PseudoSessionDataSourceAdapter;

  beforeAll(async () => {
    ctx = await createTestContext();
    adapter = new PseudoSessionDataSourceAdapter(ctx.addressSpace, consoleLogger);
    await adapter.connect();
  }, 60_000);

  afterAll(async () => {
    if (adapter) {
      await adapter.disconnect();
    }
    await teardownTestContext(ctx);
  });

  // ── Lifecycle ──────────────────────────────────────────────

  it('connect / disconnect / isConnected cycle', async () => {
    expect(adapter.isConnected()).toBe(true);
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
  });

  it('throws when accessing session while disconnected', async () => {
    const disconnected = new PseudoSessionDataSourceAdapter(
      ctx.addressSpace,
      consoleLogger,
    );
    // Not connected — readValue requires a session
    await expect(disconnected.readValue(ctx.nodeIds.temperature)).rejects.toThrow(
      'PseudoSession not connected',
    );
  });

  // ── getNamespaces ──────────────────────────────────────────

  it('returns namespaces including the test namespace', async () => {
    const ns = await adapter.getNamespaces();
    expect(ns.length).toBeGreaterThan(0);
    const testNs = ns.find((n) => n.uri === 'http://test.i3x.example.com/');
    expect(testNs).toBeDefined();
    expect(testNs!.displayName).toBeTruthy();
  });

  // ── browseTree ─────────────────────────────────────────────

  it('browses the address space tree with parent–child links', async () => {
    const nodes = await adapter.browseTree();
    expect(nodes.length).toBeGreaterThan(0);

    // TestObject exists as an Object
    const obj = nodes.find((n) => n.browseName.includes('TestObject'));
    expect(obj).toBeDefined();
    expect(obj!.nodeClass).toBe('Object');

    // Temperature is a Variable child of TestObject
    const temp = nodes.find(
      (n) =>
        n.browseName.includes('Temperature') &&
        n.parentSourceNodeId === obj?.sourceNodeId,
    );
    expect(temp).toBeDefined();
    expect(temp!.nodeClass).toBe('Variable');
    expect(temp!.nsuQualifiedName).toContain('http://test.i3x.example.com/');
  });

  it('browses nested children (NestedChild → NestedTemp)', async () => {
    const nodes = await adapter.browseTree();
    const nested = nodes.find((n) => n.browseName.includes('NestedChild'));
    expect(nested).toBeDefined();
    expect(nested!.nodeClass).toBe('Object');

    const nestedVar = nodes.find((n) => n.browseName.includes('NestedTemp'));
    expect(nestedVar).toBeDefined();
    expect(nestedVar!.nodeClass).toBe('Variable');
    // Parent should be the NestedChild object
    expect(nestedVar!.parentSourceNodeId).toBe(nested!.sourceNodeId);
  });

  it('browseTree with "all" filter includes ns=0 nodes', async () => {
    const allAdapter = new PseudoSessionDataSourceAdapter(
      ctx.addressSpace,
      consoleLogger,
      'all',
    );
    await allAdapter.connect();
    const nodes = await allAdapter.browseTree();

    // Should include Server object (ns=0)
    const server = nodes.find((n) => n.browseName.includes('Server'));
    expect(server).toBeDefined();
    await allAdapter.disconnect();
  });

  it('browseTree with explicit filter only includes matching', async () => {
    const filterAdapter = new PseudoSessionDataSourceAdapter(
      ctx.addressSpace,
      consoleLogger,
      ['TestObject'],
    );
    await filterAdapter.connect();
    const nodes = await filterAdapter.browseTree();

    // TestObject should be present
    const obj = nodes.find((n) => n.browseName.includes('TestObject'));
    expect(obj).toBeDefined();

    // EmptyObject should NOT be present
    const empty = nodes.find((n) => n.browseName.includes('EmptyObject'));
    expect(empty).toBeUndefined();
    await filterAdapter.disconnect();
  });

  // ── readValue / readValues ─────────────────────────────────

  it('reads single and multiple values', async () => {
    // Single
    const single = await adapter.readValue(ctx.nodeIds.temperature);
    expect(single.value).toBe(43.0);
    expect(single.quality).toBe('Good');
    expect(single.timestamp).toBeTruthy();

    // Multiple
    const multi = await adapter.readValues([
      ctx.nodeIds.temperature,
      ctx.nodeIds.pressure,
    ]);
    expect(multi).toHaveLength(2);
    expect(multi[0]!.value).toBe(43.0);
    expect(multi[1]!.value).toBe(102.0);

    // Empty
    expect(await adapter.readValues([])).toHaveLength(0);
  });

  // ── writeValue ─────────────────────────────────────────────

  it('writes a value and reads it back', async () => {
    await adapter.writeValue(ctx.nodeIds.temperature, 99.9);
    const result = await adapter.readValue(ctx.nodeIds.temperature);
    expect(result.value).toBe(99.9);
    // restore for other tests
    await adapter.writeValue(ctx.nodeIds.temperature, 42.5);
  });

  it('throws when writing to a non-Variable node', async () => {
    await expect(adapter.writeValue(ctx.nodeIds.testObject, 42)).rejects.toThrow(
      'is not a Variable',
    );
  });

  it('throws when writing to a non-existent node', async () => {
    await expect(adapter.writeValue('ns=99;s=DoesNotExist', 42)).rejects.toThrow(
      'is not a Variable',
    );
  });

  // ── getObjectTypes ─────────────────────────────────────────

  it('returns object types including BaseObjectType', async () => {
    const types = await adapter.getObjectTypes();
    expect(types.length).toBeGreaterThan(0);
    const base = types.find((t) => t.browseName.includes('BaseObjectType'));
    expect(base).toBeDefined();
  });

  it('enriches custom ObjectTypes (non-ns=0) with members', async () => {
    const types = await adapter.getObjectTypes();
    const machine = types.find((t) => t.browseName.includes('TestMachineType'));
    expect(machine).toBeDefined();
    expect(machine!.members).toBeDefined();
    expect(machine!.members!.length).toBeGreaterThanOrEqual(2);

    // Variable member
    const speed = machine!.members!.find((m) => m.browseName === 'Speed');
    expect(speed).toBeDefined();
    expect(speed!.nodeClass).toBe('Variable');
    expect(speed!.dataType).toBeTruthy();
    expect(speed!.modellingRule).toBe('Mandatory');

    // Method member
    const start = machine!.members!.find((m) => m.browseName === 'Start');
    expect(start).toBeDefined();
    expect(start!.nodeClass).toBe('Method');
  });

  // ── readHistory ─────────────────────────────────────────────

  it('readHistory returns at least one VQT from the current value', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    const result = await adapter.readHistory(ctx.nodeIds.temperature, oneHourAgo, now);

    // Must return at least one data point
    expect(result.length).toBeGreaterThan(0);

    // Each entry must be a well-formed VQT
    for (const vqt of result) {
      expect(vqt).toHaveProperty('value');
      expect(vqt).toHaveProperty('quality');
      expect(vqt).toHaveProperty('timestamp');
      expect(typeof vqt.timestamp).toBe('string');
      expect(new Date(vqt.timestamp).getTime()).not.toBeNaN();
    }

    // The value should be the current temperature
    expect(typeof result[0].value).toBe('number');
  });

  it('readHistory reads from historian when data exists', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    // Temperature has historization installed and seeded values
    const result = await adapter.readHistory(ctx.nodeIds.temperature, oneHourAgo, now);
    // Should have historian data (seeded values)
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].quality).toBe('Good');
  });

  it('readHistory on Object node finds first child Variable', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    const result = await adapter.readHistory(ctx.nodeIds.testObject, oneHourAgo, now);
    // TestObject has Temperature as first child Variable
    expect(result.length).toBeGreaterThan(0);
    expect(typeof result[0].value).toBe('number');
  });

  it('readHistory on nested Object finds grandchild Variable', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    // NestedChild has NestedTemp as child Variable
    const result = await adapter.readHistory(ctx.nodeIds.nestedChild, oneHourAgo, now);
    expect(result.length).toBeGreaterThan(0);
  });

  it('readHistory on empty Object returns empty', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    const result = await adapter.readHistory(ctx.nodeIds.emptyObject, oneHourAgo, now);
    expect(result).toHaveLength(0);
  });

  it('readHistory returns empty for non-existent node', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    const result = await adapter.readHistory('ns=99;s=DoesNotExist', oneHourAgo, now);
    expect(result).toHaveLength(0);
  });

  it('readHistory returns empty for non-Object, non-Variable node', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    // ObjectType is neither Object nor Variable
    const result = await adapter.readHistory(
      ctx.nodeIds.testMachineType,
      oneHourAgo,
      now,
    );
    expect(result).toHaveLength(0);
  });

  it('readHistory on deeply nested Object recurses into children', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    // DeepParent has only Object children (DeepChild),
    // and DeepChild has a Variable — triggers recursive search
    const result = await adapter.readHistory(ctx.nodeIds.deepParent, oneHourAgo, now);
    expect(result.length).toBeGreaterThan(0);
    expect(typeof result[0].value).toBe('number');
  });
});
