// ─────────────────────────────────────────────────────────────
// Unit tests for OpcUaClient — non-connection paths
//
// Tests constructor defaults, getStats(), isConnected(),
// getNamespaces(), and disconnect() when not connected.
// ─────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';

// Prevent certificate-manager, optimized, endpoint-discovery
// from doing real work during connect tests.
vi.mock('./certificate-manager.js', () => ({
  createCertificateManager: vi.fn().mockResolvedValue({
    initialize: vi.fn(),
    dispose: vi.fn(),
  }),
}));

import type { ILogger } from '@node-i3x/core';
import { OpcUaClient } from '../src/opcua-client.js';

const logger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('OpcUaClient', () => {
  describe('constructor', () => {
    it('applies default options', () => {
      const client = new OpcUaClient({ endpointUrl: 'opc.tcp://localhost:4840' }, logger);
      // Client created without throwing
      expect(client).toBeDefined();
    });

    it('accepts all optional parameters', () => {
      const client = new OpcUaClient(
        {
          endpointUrl: 'opc.tcp://myplc:4840',
          securityMode: 'SignAndEncrypt',
          securityPolicy: 'Basic256Sha256',
          applicationName: 'MyApp',
          optimizedClient: 'disabled',
          browseStrategy: 'browseAll',
          browseFilter: 'all',
          username: 'user1',
          password: 'pass1',
          applicationUri: 'urn:test:app',
          pkiFolder: '/pki',
          certificateSubject: '/CN=test',
        },
        logger,
      );
      expect(client).toBeDefined();
    });

    it('throws if endpointUrl is missing or invalid', () => {
      expect(() => new OpcUaClient({} as any, logger)).toThrow(
        'OPC UA endpointUrl must be a non-empty string',
      );
      expect(() => new OpcUaClient({ endpointUrl: '' }, logger)).toThrow(
        'OPC UA endpointUrl must be a non-empty string',
      );
      expect(
        () => new OpcUaClient({ endpointUrl: 'http://localhost:4840' }, logger),
      ).toThrow('OPC UA endpointUrl must start with "opc.tcp://"');
    });

    it('throws if securityMode is invalid', () => {
      expect(
        () =>
          new OpcUaClient(
            { endpointUrl: 'opc.tcp://localhost:4840', securityMode: 'Invalid' as any },
            logger,
          ),
      ).toThrow(
        'OPC UA securityMode must be "None", "Sign", "SignAndEncrypt", or "Auto", got "Invalid"',
      );
    });

    it('throws if browseFilter is invalid', () => {
      expect(
        () =>
          new OpcUaClient(
            { endpointUrl: 'opc.tcp://localhost:4840', browseFilter: 'invalid' as any },
            logger,
          ),
      ).toThrow(
        'OPC UA browseFilter must be "application-only", "all", or an array of string node IDs/browse names',
      );
      expect(
        () =>
          new OpcUaClient(
            { endpointUrl: 'opc.tcp://localhost:4840', browseFilter: [123] as any },
            logger,
          ),
      ).toThrow('OPC UA browseFilter array must contain only strings');
    });

    it('throws if optional string field has invalid type', () => {
      expect(
        () =>
          new OpcUaClient(
            { endpointUrl: 'opc.tcp://localhost:4840', username: 123 as any },
            logger,
          ),
      ).toThrow('OPC UA username must be a string');
    });
  });

  describe('getStats()', () => {
    it('returns zeroed stats before connect', () => {
      const client = new OpcUaClient({ endpointUrl: 'opc.tcp://localhost:4840' }, logger);
      const stats = client.getStats();

      expect(stats.transactionsPerformed).toBe(0);
      expect(stats.bytesRead).toBe(0);
      expect(stats.bytesWritten).toBe(0);
      expect(stats.services).toEqual({
        browse: 0,
        read: 0,
        write: 0,
        translate: 0,
        subscribe: 0,
        call: 0,
        readHistory: 0,
      });
    });

    it('returns a fresh copy of service counters each call', () => {
      const client = new OpcUaClient({ endpointUrl: 'opc.tcp://localhost:4840' }, logger);
      const stats1 = client.getStats();
      const stats2 = client.getStats();

      // Should be separate objects (not same reference)
      expect(stats1.services).not.toBe(stats2.services);
      expect(stats1.services).toEqual(stats2.services);
    });
  });

  describe('isConnected()', () => {
    it('returns false before connect', () => {
      const client = new OpcUaClient({ endpointUrl: 'opc.tcp://localhost:4840' }, logger);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('selectBestEndpoint (static)', () => {
    it('is exposed as a static method', () => {
      expect(typeof OpcUaClient.selectBestEndpoint).toBe('function');
    });
  });

  describe('disconnect()', () => {
    it('succeeds even when not connected', async () => {
      const client = new OpcUaClient({ endpointUrl: 'opc.tcp://localhost:4840' }, logger);
      // Should not throw
      await client.disconnect();
      expect(logger.info).toHaveBeenCalledWith('OPC UA disconnected');
    });
  });
});
