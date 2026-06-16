// ─────────────────────────────────────────────────────────────
// Unit tests for discoverBestEndpoint()
//
// Mocks OPCUAClient to test the async discovery flow without
// a real OPC UA server. Covers lines 152–209 of
// endpoint-discovery.ts.
// ─────────────────────────────────────────────────────────────

import { MessageSecurityMode } from 'node-opcua';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────

const { mockConnect, mockGetEndpoints, mockDisconnect } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockGetEndpoints: vi.fn().mockResolvedValue([]),
  mockDisconnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node-opcua', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-opcua')>();
  return {
    ...actual,
    OPCUAClient: {
      create: vi.fn().mockReturnValue({
        connect: mockConnect,
        getEndpoints: mockGetEndpoints,
        disconnect: mockDisconnect,
      }),
    },
  };
});

import type { ILogger } from '@node-i3x/core';
import type { EndpointLike } from '../src/endpoint-discovery.js';
import { discoverBestEndpoint } from '../src/endpoint-discovery.js';

const SP = {
  None: 'http://opcfoundation.org/UA/SecurityPolicy#None',
  Basic256Sha256: 'http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256',
  Aes256_Sha256_RsaPss: 'http://opcfoundation.org/UA/SecurityPolicy#Aes256_Sha256_RsaPss',
};

function ep(
  mode: MessageSecurityMode,
  policyUri: string,
  securityLevel = 1,
): EndpointLike {
  return { securityMode: mode, securityPolicyUri: policyUri, securityLevel };
}

const logger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('discoverBestEndpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers and selects the best endpoint', async () => {
    mockGetEndpoints.mockResolvedValueOnce([
      ep(MessageSecurityMode.None, SP.None, 0),
      ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 3),
      ep(MessageSecurityMode.SignAndEncrypt, SP.Aes256_Sha256_RsaPss, 4),
    ]);

    const result = await discoverBestEndpoint('opc.tcp://localhost:4840', logger);

    expect(result.securityMode).toBe(MessageSecurityMode.SignAndEncrypt);
    expect(result.securityPolicy).toContain('Aes256_Sha256_RsaPss');
    expect(mockConnect).toHaveBeenCalledWith('opc.tcp://localhost:4840');
    expect(mockDisconnect).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it('falls back to None/None when discovery fails (no filters)', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await discoverBestEndpoint('opc.tcp://unreachable:4840', logger);

    expect(result.securityMode).toBe(MessageSecurityMode.None);
    expect(result.securityPolicy).toContain('None');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('propagates error when filters are set and discovery fails', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(
      discoverBestEndpoint(
        'opc.tcp://unreachable:4840',
        logger,
        MessageSecurityMode.SignAndEncrypt,
      ),
    ).rejects.toThrow('Connection refused');
  });

  it('propagates error with policyFilter when discovery fails', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Timeout'));

    await expect(
      discoverBestEndpoint(
        'opc.tcp://unreachable:4840',
        logger,
        undefined,
        SP.Basic256Sha256,
      ),
    ).rejects.toThrow('Timeout');
  });

  it('applies modeFilter to discovered endpoints', async () => {
    mockGetEndpoints.mockResolvedValueOnce([
      ep(MessageSecurityMode.None, SP.None, 0),
      ep(MessageSecurityMode.Sign, SP.Basic256Sha256, 2),
      ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 3),
    ]);

    const result = await discoverBestEndpoint(
      'opc.tcp://localhost:4840',
      logger,
      MessageSecurityMode.Sign,
    );

    expect(result.securityMode).toBe(MessageSecurityMode.Sign);
  });

  it('applies policyFilter to discovered endpoints', async () => {
    mockGetEndpoints.mockResolvedValueOnce([
      ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 3),
      ep(MessageSecurityMode.SignAndEncrypt, SP.Aes256_Sha256_RsaPss, 4),
    ]);

    const result = await discoverBestEndpoint(
      'opc.tcp://localhost:4840',
      logger,
      undefined,
      SP.Basic256Sha256,
    );

    expect(result.securityPolicy).toContain('Basic256Sha256');
  });

  it('disconnects discovery client even when filters cause error', async () => {
    mockGetEndpoints.mockResolvedValueOnce([ep(MessageSecurityMode.None, SP.None, 0)]);

    await expect(
      discoverBestEndpoint(
        'opc.tcp://localhost:4840',
        logger,
        MessageSecurityMode.SignAndEncrypt,
      ),
    ).rejects.toThrow(/securityMode/);

    // disconnect should still be called (cleanup)
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('handles disconnect failure during error cleanup gracefully', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection refused'));
    mockDisconnect.mockRejectedValueOnce(new Error('Already closed'));

    // No filters → fallback path (lines 198-204)
    const result = await discoverBestEndpoint('opc.tcp://unreachable:4840', logger);

    expect(result.securityMode).toBe(MessageSecurityMode.None);
    expect(logger.debug).toHaveBeenCalled();
  });

  it('handles disconnect failure during filter error cleanup', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection refused'));
    mockDisconnect.mockRejectedValueOnce(new Error('Already closed'));

    // With filter → rethrow path (lines 185-192)
    await expect(
      discoverBestEndpoint(
        'opc.tcp://unreachable:4840',
        logger,
        MessageSecurityMode.SignAndEncrypt,
      ),
    ).rejects.toThrow('Connection refused');

    expect(logger.debug).toHaveBeenCalled();
  });
});
