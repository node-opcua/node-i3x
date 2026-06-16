// ─────────────────────────────────────────────────────────────
// Unit tests for resolveConfig()
// ─────────────────────────────────────────────────────────────

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

describe('resolveConfig', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Snapshot all relevant env vars so we can restore them
    savedEnv = {};
    for (const key of I3X_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
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
  });

  // ── 1. Defaults ──────────────────────────────────────────
  it('returns defaults when no CLI args, no env vars, no config file', async () => {
    const config = await resolveConfig({});

    expect(config.endpoint).toBe('opc.tcp://localhost:4840');
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.securityMode).toBe('Auto');
    expect(config.securityPolicy).toBe('Auto');
    expect(config.optimizedClient).toBe('auto');
    expect(config.publishIntervalMs).toBe(1000);
    expect(config.samplingIntervalMs).toBe(250);
    expect(config.logLevel).toBe('info');
    expect(config.preload).toBe(true);
    expect(config.preloadStrict).toBe(false);
    expect(config.readOnly).toBe(false);
    expect(config.requireAuth).toBe(false);
    expect(config.experimental).toBe(false);
  });

  // ── 2. CLI args override defaults ────────────────────────
  it('CLI args override defaults', async () => {
    const config = await resolveConfig({
      port: 3000,
      logLevel: 'debug',
      host: '127.0.0.1',
      readOnly: true,
    });

    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('debug');
    expect(config.host).toBe('127.0.0.1');
    expect(config.readOnly).toBe(true);
    // untouched defaults stay intact
    expect(config.endpoint).toBe('opc.tcp://localhost:4840');
  });

  // ── 3. Env vars override defaults ────────────────────────
  it('env vars override defaults', async () => {
    process.env.NODE_I3X_PORT = '9090';
    process.env.NODE_I3X_LOG_LEVEL = 'warn';
    process.env.NODE_I3X_HOST = '192.168.1.1';
    process.env.NODE_I3X_OPCUA_ENDPOINT = 'opc.tcp://plc:4840';
    process.env.NODE_I3X_READ_ONLY = 'true';

    const config = await resolveConfig({});

    expect(config.port).toBe(9090);
    expect(config.logLevel).toBe('warn');
    expect(config.host).toBe('192.168.1.1');
    expect(config.endpoint).toBe('opc.tcp://plc:4840');
    expect(config.readOnly).toBe(true);
    // untouched defaults stay intact
    expect(config.securityMode).toBe('Auto');
  });

  // ── 4. CLI args override env vars ────────────────────────
  it('CLI args override env vars', async () => {
    process.env.NODE_I3X_PORT = '9090';
    process.env.NODE_I3X_LOG_LEVEL = 'warn';

    const config = await resolveConfig({
      port: 4000,
      logLevel: 'error',
    });

    expect(config.port).toBe(4000);
    expect(config.logLevel).toBe('error');
  });

  // ── 5. requireAuth defaults to false ─────────────────────
  it('requireAuth defaults to false', async () => {
    const config = await resolveConfig({});
    expect(config.requireAuth).toBe(false);
  });

  // ── 6. requireAuth can be set via env var ────────────────
  it('requireAuth can be set via NODE_I3X_REQUIRE_AUTH=true', async () => {
    process.env.NODE_I3X_REQUIRE_AUTH = 'true';

    const config = await resolveConfig({});
    expect(config.requireAuth).toBe(true);
  });

  // ── 7. Boolean env parsing: '1' and 'true' both work ────
  it("boolean env parsing: '1' is treated as true", async () => {
    process.env.NODE_I3X_REQUIRE_AUTH = '1';
    process.env.NODE_I3X_READ_ONLY = '1';
    process.env.NODE_I3X_EXPERIMENTAL = '1';

    const config = await resolveConfig({});

    expect(config.requireAuth).toBe(true);
    expect(config.readOnly).toBe(true);
    expect(config.experimental).toBe(true);
  });

  it("boolean env parsing: 'true' is treated as true", async () => {
    process.env.NODE_I3X_REQUIRE_AUTH = 'true';
    process.env.NODE_I3X_READ_ONLY = 'true';
    process.env.NODE_I3X_EXPERIMENTAL = 'true';

    const config = await resolveConfig({});

    expect(config.requireAuth).toBe(true);
    expect(config.readOnly).toBe(true);
    expect(config.experimental).toBe(true);
  });

  it("boolean env parsing: 'false' is treated as false", async () => {
    process.env.NODE_I3X_REQUIRE_AUTH = 'false';
    process.env.NODE_I3X_PRELOAD = 'false';

    const config = await resolveConfig({});

    expect(config.requireAuth).toBe(false);
    // 'false' is not '1' and not 'true', so envBool returns false
    expect(config.preload).toBe(false);
  });

  it("boolean env parsing: 'TRUE' (uppercase) is treated as true", async () => {
    process.env.NODE_I3X_REQUIRE_AUTH = 'TRUE';

    const config = await resolveConfig({});
    expect(config.requireAuth).toBe(true);
  });
});
