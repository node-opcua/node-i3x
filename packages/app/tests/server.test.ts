// ─────────────────────────────────────────────────────────────
// Unit tests for app/src/server.ts — startServer()
//
// The server orchestrator is integration-heavy, so we mock all
// heavy deps (OpcUaClient, createApp, createI3xStack, etc.)
// and test:
//   - IPC progress messages (sendProgress via process.send)
//   - apiKey='auto' → generates a random key
//   - requireAuth without apiKey → process.exit(1)
//   - graceful shutdown wiring
// ─────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────

const {
  mockConnect,
  mockDisconnect,
  mockGetStats,
  mockPreloadModel,
  mockPreloadTypes,
  mockSubClose,
  mockListen,
  mockClose,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDisconnect: vi.fn().mockResolvedValue(undefined),
  mockGetStats: vi.fn().mockReturnValue({
    transactionsPerformed: 0,
    bytesRead: 0,
    bytesWritten: 0,
    services: {
      browse: 0,
      read: 0,
      write: 0,
      translate: 0,
      subscribe: 0,
      call: 0,
      readHistory: 0,
    },
  }),
  mockPreloadModel: vi.fn().mockResolvedValue({ nodesById: new Map() }),
  mockPreloadTypes: vi.fn().mockResolvedValue(undefined),
  mockSubClose: vi.fn().mockResolvedValue(undefined),
  mockListen: vi.fn().mockResolvedValue(undefined),
  mockClose: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@node-i3x/opcua-connector', () => {
  // Must use real classes so `new` works with V8 coverage
  class MockOpcUaClient {
    getStats = mockGetStats;
  }
  class MockOpcUaDataSourceAdapter {
    connect = mockConnect;
    disconnect = mockDisconnect;
  }
  return {
    OpcUaClient: MockOpcUaClient,
    OpcUaDataSourceAdapter: MockOpcUaDataSourceAdapter,
  };
});

vi.mock('@node-i3x/core', () => ({
  consoleLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createI3xStack: vi.fn().mockReturnValue({
    modelService: { preloadModel: mockPreloadModel },
    valueService: {},
    historyService: {},
    subscriptionService: { close: mockSubClose },
    typeService: { preloadTypes: mockPreloadTypes },
  }),
}));

vi.mock('@node-i3x/rest-server', () => ({
  createApp: vi.fn().mockResolvedValue({
    listen: mockListen,
    close: mockClose,
  }),
}));

vi.mock('../src/banner.js', () => ({
  printBanner: vi.fn(),
}));

// Import after mocks are set up
import type { I3xConfig } from '../src/config.js';
import { startServer } from '../src/server.js';

function makeConfig(overrides: Partial<I3xConfig> = {}): I3xConfig {
  return {
    endpoint: 'opc.tcp://localhost:4840',
    port: 8080,
    host: '0.0.0.0',
    securityMode: 'None',
    securityPolicy: 'None',
    optimizedClient: 'auto',
    publishIntervalMs: 1000,
    samplingIntervalMs: 250,
    logLevel: 'info',
    preload: false,
    preloadStrict: false,
    readOnly: false,
    requireAuth: false,
    experimental: false,
    ...overrides,
  };
}

describe('startServer', () => {
  let processOnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    processOnSpy = vi.spyOn(process, 'on').mockReturnValue(process);
  });

  afterEach(() => {
    processOnSpy.mockRestore();
  });

  it('starts successfully with default config', async () => {
    await startServer(makeConfig(), '1.0.0');

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockListen).toHaveBeenCalledWith({ port: 8080, host: '0.0.0.0' });
  });

  it('sends IPC progress messages when process.send exists', async () => {
    const sendSpy = vi.fn();
    process.send = sendSpy;
    try {
      await startServer(makeConfig(), '1.0.0');

      // Should have sent multiple progress messages
      expect(sendSpy).toHaveBeenCalled();
      const phases = sendSpy.mock.calls.map(
        (c: unknown[]) => (c[0] as Record<string, unknown>).phase,
      );
      expect(phases).toContain('initializing');
      expect(phases).toContain('connecting');
      expect(phases).toContain('ready');
    } finally {
      delete (process as Record<string, unknown>).send;
    }
  });

  it('generates a random API key when apiKey is "auto"', async () => {
    const { createApp } = await import('@node-i3x/rest-server');
    await startServer(makeConfig({ apiKey: 'auto' }), '1.0.0');

    const call = (createApp as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.apiKey).toMatch(/^i3x_sk_[0-9a-f]{32}$/);
  });

  it('exits with code 1 when requireAuth is true but no apiKey', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    try {
      await expect(
        startServer(makeConfig({ requireAuth: true }), '1.0.0'),
      ).rejects.toThrow('process.exit');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('registers SIGINT and SIGTERM handlers', async () => {
    await startServer(makeConfig(), '1.0.0');

    const signals = processOnSpy.mock.calls.map((c) => c[0]);
    expect(signals).toContain('SIGINT');
    expect(signals).toContain('SIGTERM');
  });

  it('preloads model when config.preload is true', async () => {
    await startServer(makeConfig({ preload: true }), '1.0.0');

    expect(mockPreloadModel).toHaveBeenCalledOnce();
    expect(mockPreloadTypes).toHaveBeenCalledOnce();
  });

  it('exits on preload failure when preloadStrict is true', async () => {
    mockPreloadModel.mockRejectedValueOnce(new Error('browse failed'));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    try {
      await startServer(makeConfig({ preload: true, preloadStrict: true }), '1.0.0');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('continues after preload failure when preloadStrict is false', async () => {
    mockPreloadModel.mockRejectedValueOnce(new Error('browse failed'));

    await startServer(makeConfig({ preload: true, preloadStrict: false }), '1.0.0');

    // Server still started despite preload failure
    expect(mockListen).toHaveBeenCalled();
  });
});
