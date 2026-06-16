// ─────────────────────────────────────────────────────────────
// Unit tests for resolveConfig() — config file loading paths
// Covers lines 138–151 of config.ts (YAML loaders, load(),
// search(), and the catch branch).
// ─────────────────────────────────────────────────────────────

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';

// All NODE_I3X_* env vars that resolveConfig reads
const I3X_ENV_KEYS = [
  'NODE_I3X_OPCUA_ENDPOINT',
  'NODE_I3X_ENDPOINT',
  'NODE_I3X_PORT',
  'NODE_I3X_HOST',
  'NODE_I3X_OPCUA_SECURITY_MODE',
  'NODE_I3X_OPCUA_SECURITY_POLICY',
  'NODE_I3X_PKI_FOLDER',
  'NODE_I3X_CERTIFICATE_SUBJECT',
  'NODE_I3X_OPCUA_OPTIMIZED_CLIENT',
  'NODE_I3X_PUBLISH_INTERVAL_MS',
  'NODE_I3X_SAMPLING_INTERVAL_MS',
  'NODE_I3X_LOG_LEVEL',
  'NODE_I3X_PRELOAD',
  'NODE_I3X_PRELOAD_STRICT',
  'NODE_I3X_OPCUA_USERNAME',
  'NODE_I3X_OPCUA_PASSWORD',
  'NODE_I3X_READ_ONLY',
  'NODE_I3X_REQUIRE_AUTH',
  'NODE_I3X_EXPERIMENTAL',
  'NODE_I3X_API_KEY',
] as const;

describe('resolveConfig — config file loading', () => {
  let savedEnv: Record<string, string | undefined>;
  let tmpDir: string;

  beforeEach(() => {
    // Snapshot all relevant env vars so we can restore them
    savedEnv = {};
    for (const key of I3X_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i3x-config-test-'));
  });

  afterEach(() => {
    // Restore original env vars
    for (const key of I3X_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── YAML config file loading (covers .yml loader, line 139) ──
  it('loads a YAML config file via configPath', async () => {
    const configFile = path.join(tmpDir, 'i3x.config.yml');
    fs.writeFileSync(
      configFile,
      ['endpoint: opc.tcp://myplc:4840', 'port: 3333', 'logLevel: debug'].join('\n'),
    );

    const config = await resolveConfig({}, configFile);

    expect(config.endpoint).toBe('opc.tcp://myplc:4840');
    expect(config.port).toBe(3333);
    expect(config.logLevel).toBe('debug');
    // Defaults still apply for unset keys
    expect(config.host).toBe('0.0.0.0');
  });

  // ── .yaml extension (covers .yaml loader, line 140) ─────────
  it('loads a .yaml config file via configPath', async () => {
    const configFile = path.join(tmpDir, 'i3x.config.yaml');
    fs.writeFileSync(
      configFile,
      ['endpoint: opc.tcp://other:4840', 'readOnly: true'].join('\n'),
    );

    const config = await resolveConfig({}, configFile);

    expect(config.endpoint).toBe('opc.tcp://other:4840');
    expect(config.readOnly).toBe(true);
  });

  // ── JSON config file loading ─────────────────────────────────
  it('loads a JSON config file via configPath', async () => {
    const configFile = path.join(tmpDir, 'i3x.config.json');
    fs.writeFileSync(
      configFile,
      JSON.stringify({ endpoint: 'opc.tcp://json:4840', port: 5555 }),
    );

    const config = await resolveConfig({}, configFile);

    expect(config.endpoint).toBe('opc.tcp://json:4840');
    expect(config.port).toBe(5555);
  });

  // ── CLI args override config file values ─────────────────────
  it('CLI args override config file values', async () => {
    const configFile = path.join(tmpDir, 'i3x.config.yml');
    fs.writeFileSync(configFile, 'port: 9999\n');

    const config = await resolveConfig({ port: 1111 }, configFile);

    expect(config.port).toBe(1111);
  });

  // ── Env vars override config file values ─────────────────────
  it('env vars override config file values', async () => {
    const configFile = path.join(tmpDir, 'i3x.config.yml');
    fs.writeFileSync(configFile, 'port: 9999\n');
    process.env.NODE_I3X_PORT = '7777';

    const config = await resolveConfig({}, configFile);

    expect(config.port).toBe(7777);
  });

  // ── Invalid config path triggers catch branch (line 149–151) ─
  it('falls back to defaults when configPath is invalid', async () => {
    const bogusPath = path.join(tmpDir, 'does-not-exist.yml');

    const config = await resolveConfig({}, bogusPath);

    // Should fall back to defaults (catch branch hit)
    expect(config.endpoint).toBe('opc.tcp://localhost:4840');
    expect(config.port).toBe(8080);
  });

  // ── Empty config file (result.isEmpty) ───────────────────────
  it('ignores empty config file', async () => {
    const configFile = path.join(tmpDir, 'i3x.config.json');
    // cosmiconfig treats an empty JSON object as isEmpty
    fs.writeFileSync(configFile, '');

    const config = await resolveConfig({}, configFile);

    // Should fall back to defaults
    expect(config.endpoint).toBe('opc.tcp://localhost:4840');
  });
});
