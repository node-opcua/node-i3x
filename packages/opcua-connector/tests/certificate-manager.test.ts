// ─────────────────────────────────────────────────────────────
// Unit tests for certificate-manager.ts
//
// Mocks OPCUACertificateManager to test the factory function
// without touching the filesystem. Covers lines 85–87
// (cert-already-exists branch).
// ─────────────────────────────────────────────────────────────

import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────

const { mockInitialize, mockCreateSelfSigned } = vi.hoisted(() => ({
  mockInitialize: vi.fn().mockResolvedValue(undefined),
  mockCreateSelfSigned: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node-opcua-certificate-manager', () => {
  // Must be a real class so `new` works
  class MockOPCUACertificateManager {
    rootFolder: string;
    constructor(opts: Record<string, unknown>) {
      this.rootFolder = opts.rootFolder as string;
      // Store constructor calls for assertions
      MockOPCUACertificateManager._calls.push(opts);
    }
    static _calls: Record<string, unknown>[] = [];
    initialize = mockInitialize;
    createSelfSignedCertificate = mockCreateSelfSigned;
  }
  return { OPCUACertificateManager: MockOPCUACertificateManager };
});

import type { ILogger } from '@node-i3x/core';
import { OPCUACertificateManager } from 'node-opcua-certificate-manager';
import { createCertificateManager } from '../src/certificate-manager.js';

const logger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('createCertificateManager', () => {
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (OPCUACertificateManager as unknown as { _calls: unknown[] })._calls = [];
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
  });

  it('initializes certificate manager and creates self-signed cert', async () => {
    const cm = await createCertificateManager(
      {
        endpointUrl: 'opc.tcp://localhost:4840',
        applicationName: 'test-app',
      },
      logger,
    );

    expect(cm).toBeDefined();
    expect(mockInitialize).toHaveBeenCalledOnce();
    expect(mockCreateSelfSigned).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalled();
  });

  it('skips self-signed cert creation when cert already exists', async () => {
    // Simulate certificate already on disk (covers lines 85–87)
    existsSyncSpy.mockReturnValue(true);

    await createCertificateManager(
      {
        endpointUrl: 'opc.tcp://localhost:4840',
        applicationName: 'test-app',
      },
      logger,
    );

    expect(mockCreateSelfSigned).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Client certificate exists'),
    );
  });

  it('uses custom pkiFolder when provided', async () => {
    await createCertificateManager(
      {
        endpointUrl: 'opc.tcp://localhost:4840',
        applicationName: 'test-app',
        pkiFolder: '/custom/pki/path',
      },
      logger,
    );

    const calls = (
      OPCUACertificateManager as unknown as { _calls: Record<string, unknown>[] }
    )._calls;
    expect(calls.at(-1)).toEqual(
      expect.objectContaining({ rootFolder: '/custom/pki/path' }),
    );
  });

  it('uses custom applicationUri in self-signed cert', async () => {
    await createCertificateManager(
      {
        endpointUrl: 'opc.tcp://localhost:4840',
        applicationName: 'test-app',
        applicationUri: 'urn:custom:app',
      },
      logger,
    );

    expect(mockCreateSelfSigned).toHaveBeenCalledWith(
      expect.objectContaining({ applicationUri: 'urn:custom:app' }),
    );
  });

  it('uses custom certificateSubject in self-signed cert', async () => {
    await createCertificateManager(
      {
        endpointUrl: 'opc.tcp://localhost:4840',
        applicationName: 'test-app',
        certificateSubject: '/CN=custom/O=Test',
      },
      logger,
    );

    expect(mockCreateSelfSigned).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '/CN=custom/O=Test' }),
    );
  });

  it('derives unique pkiFolder from endpoint URL hash', async () => {
    await createCertificateManager(
      {
        endpointUrl: 'opc.tcp://server-a:4840',
        applicationName: 'test-app',
      },
      logger,
    );

    const calls = (
      OPCUACertificateManager as unknown as { _calls: Record<string, unknown>[] }
    )._calls;
    const folder1 = calls.at(-1)!.rootFolder;

    await createCertificateManager(
      {
        endpointUrl: 'opc.tcp://server-b:4840',
        applicationName: 'test-app',
      },
      logger,
    );
    const folder2 = calls.at(-1)!.rootFolder;

    // Different endpoints → different PKI folders
    expect(folder1).not.toBe(folder2);
  });
});
