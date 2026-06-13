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
  });

  afterAll(async () => {
    await adapter.disconnect();
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

  // ── getObjectTypes ─────────────────────────────────────────

  it('returns object types including BaseObjectType', async () => {
    const types = await adapter.getObjectTypes();
    expect(types.length).toBeGreaterThan(0);
    const base = types.find((t) => t.browseName.includes('BaseObjectType'));
    expect(base).toBeDefined();
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
});
