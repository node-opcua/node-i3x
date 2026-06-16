// ─────────────────────────────────────────────────────────────
// E2E security connection tests
//
// Verifies that OpcUaClient can establish connection with
// a real OPC UA server under various security combinations:
// - securityMode: None | Auto | Sign | SignAndEncrypt
// - securityPolicy: Auto | Basic256Sha256
// ─────────────────────────────────────────────────────────────

import path from 'node:path';
import { consoleLogger } from '@node-i3x/core';
import { OpcUaClient, OpcUaDataSourceAdapter } from '@node-i3x/opcua-connector';
import { nodesets, OPCUACertificateManager, OPCUAServer } from 'node-opcua';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('E2E: Secure Connection Combinations', () => {
  let serverPort: number;
  let opcuaServer: OPCUAServer;
  let endpointUrl: string;

  beforeAll(async () => {
    // Generate a unique port to avoid collision
    serverPort = 48300 + Math.floor(Math.random() * 500);

    opcuaServer = new OPCUAServer({
      port: serverPort,
      resourcePath: '/UA/i3xSecurityTest',
      nodeset_filename: [nodesets.standard],
      maxConnectionsPerEndpoint: 10,
      serverInfo: {
        applicationName: { text: 'i3x E2E Security Server' },
        applicationUri: 'urn:i3x:e2e:security',
        productUri: 'urn:i3x:e2e:security',
      },
      // Configure the server to accept any client certificates automatically
      serverCertificateManager: new OPCUACertificateManager({
        automaticallyAcceptUnknownCertificate: true,
        rootFolder: path.join(process.cwd(), 'pki/server-for-security-test'),
      }),
    });

    await opcuaServer.initialize();
    await opcuaServer.start();
    endpointUrl = `opc.tcp://localhost:${serverPort}/UA/i3xSecurityTest`;
  }, 60000);

  afterAll(async () => {
    if (opcuaServer) {
      await opcuaServer.shutdown(500);
    }
  });

  const testCases = [
    { securityMode: 'None', securityPolicy: 'Auto' },
    { securityMode: 'Auto', securityPolicy: 'Auto' },
    { securityMode: 'Sign', securityPolicy: 'Basic256Sha256' },
    { securityMode: 'Sign', securityPolicy: 'Auto' },
    { securityMode: 'SignAndEncrypt', securityPolicy: 'Basic256Sha256' },
    { securityMode: 'SignAndEncrypt', securityPolicy: 'Auto' },
  ] as const;

  for (const tc of testCases) {
    it(`connects with securityMode=${tc.securityMode}, securityPolicy=${tc.securityPolicy}`, async () => {
      const client = new OpcUaClient(
        {
          endpointUrl,
          securityMode: tc.securityMode,
          securityPolicy: tc.securityPolicy,
          optimizedClient: 'disabled', // ensure we run the standard JS driver
        },
        consoleLogger,
      );

      const adapter = new OpcUaDataSourceAdapter(client, consoleLogger);

      try {
        await adapter.connect();
        expect(client.isConnected()).toBe(true);
      } finally {
        await adapter.disconnect();
      }
    }, 60000); // 60s timeout per security handshake to prevent flakes under heavy load
  }
});
