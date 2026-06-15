// ─────────────────────────────────────────────────────────────
// Unit tests for OpcUaClient.selectBestEndpoint
// ─────────────────────────────────────────────────────────────

import { MessageSecurityMode } from 'node-opcua';
import { describe, expect, it } from 'vitest';
import { type EndpointLike, OpcUaClient } from '../src/opcua-client.js';

// ── Helpers ─────────────────────────────────────────────────

const SP = {
  None: 'http://opcfoundation.org/UA/SecurityPolicy#None',
  Basic256Sha256: 'http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256',
  Aes256_Sha256_RsaPss: 'http://opcfoundation.org/UA/SecurityPolicy#Aes256_Sha256_RsaPss',
  Aes128_Sha256_RsaOaep:
    'http://opcfoundation.org/UA/SecurityPolicy#Aes128_Sha256_RsaOaep',
  Basic256: 'http://opcfoundation.org/UA/SecurityPolicy#Basic256',
  Basic128Rsa15: 'http://opcfoundation.org/UA/SecurityPolicy#Basic128Rsa15',
};

function ep(
  mode: MessageSecurityMode,
  policyUri: string,
  securityLevel = 1,
): EndpointLike {
  return { securityMode: mode, securityPolicyUri: policyUri, securityLevel };
}

// ── Typical server endpoints ────────────────────────────────

/** Simulates a realistic server offering multiple endpoints */
const REALISTIC_ENDPOINTS: EndpointLike[] = [
  ep(MessageSecurityMode.None, SP.None, 0),
  ep(MessageSecurityMode.Sign, SP.Basic256Sha256, 2),
  ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 3),
  ep(MessageSecurityMode.Sign, SP.Aes128_Sha256_RsaOaep, 2),
  ep(MessageSecurityMode.SignAndEncrypt, SP.Aes128_Sha256_RsaOaep, 3),
  ep(MessageSecurityMode.Sign, SP.Basic128Rsa15, 1),
  ep(MessageSecurityMode.SignAndEncrypt, SP.Basic128Rsa15, 2),
  ep(MessageSecurityMode.Sign, SP.Aes256_Sha256_RsaPss, 2),
  ep(MessageSecurityMode.SignAndEncrypt, SP.Aes256_Sha256_RsaPss, 4),
];

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('OpcUaClient.selectBestEndpoint', () => {
  // ── No filters (Auto / Auto) ──────────────────────────────

  describe('no filters (Auto mode + Auto policy)', () => {
    it('picks strongest combination from realistic server', () => {
      const result = OpcUaClient.selectBestEndpoint(REALISTIC_ENDPOINTS);
      // Aes256_Sha256_RsaPss + SignAndEncrypt has securityLevel=4
      expect(result.securityMode).toBe(MessageSecurityMode.SignAndEncrypt);
      expect(result.securityPolicy).toContain('Aes256_Sha256_RsaPss');
    });

    it('prefers higher securityLevel', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, SP.Basic128Rsa15, 5),
        ep(MessageSecurityMode.SignAndEncrypt, SP.Aes256_Sha256_RsaPss, 1),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      // Basic128Rsa15 has higher securityLevel=5 despite weaker policy
      expect(result.securityPolicy).toContain('Basic128Rsa15');
    });

    it('uses policy rank as tiebreaker when securityLevel is equal', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 3),
        ep(MessageSecurityMode.SignAndEncrypt, SP.Aes256_Sha256_RsaPss, 3),
        ep(MessageSecurityMode.SignAndEncrypt, SP.Aes128_Sha256_RsaOaep, 3),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      // Aes256_Sha256_RsaPss is rank 0 (strongest)
      expect(result.securityPolicy).toContain('Aes256_Sha256_RsaPss');
    });

    it('prefers SignAndEncrypt over Sign at same level and policy', () => {
      const endpoints = [
        ep(MessageSecurityMode.Sign, SP.Basic256Sha256, 2),
        ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 2),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      expect(result.securityMode).toBe(MessageSecurityMode.SignAndEncrypt);
    });

    it('skips None endpoints when secured ones exist', () => {
      const endpoints = [
        ep(MessageSecurityMode.None, SP.None, 0),
        ep(MessageSecurityMode.Sign, SP.Basic256Sha256, 1),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      expect(result.securityMode).toBe(MessageSecurityMode.Sign);
      expect(result.securityPolicy).toContain('Basic256Sha256');
    });

    it('falls back to None when server only offers None', () => {
      const endpoints = [ep(MessageSecurityMode.None, SP.None, 0)];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      expect(result.securityMode).toBe(MessageSecurityMode.None);
    });

    it('returns None/None for empty endpoints (no filters)', () => {
      const result = OpcUaClient.selectBestEndpoint([]);
      expect(result.securityMode).toBe(MessageSecurityMode.None);
    });
  });

  // ── modeFilter (explicit mode + Auto policy) ──────────────

  describe('modeFilter (explicit mode + Auto policy)', () => {
    it('finds strongest policy for SignAndEncrypt', () => {
      const result = OpcUaClient.selectBestEndpoint(
        REALISTIC_ENDPOINTS,
        MessageSecurityMode.SignAndEncrypt,
      );
      expect(result.securityMode).toBe(MessageSecurityMode.SignAndEncrypt);
      expect(result.securityPolicy).toContain('Aes256_Sha256_RsaPss');
    });

    it('finds strongest policy for Sign', () => {
      const result = OpcUaClient.selectBestEndpoint(
        REALISTIC_ENDPOINTS,
        MessageSecurityMode.Sign,
      );
      expect(result.securityMode).toBe(MessageSecurityMode.Sign);
      // Aes256 has highest level among Sign endpoints
      expect(result.securityPolicy).toContain('Aes256_Sha256_RsaPss');
    });

    it('throws when no endpoints match the mode', () => {
      const endpoints = [
        ep(MessageSecurityMode.None, SP.None, 0),
        ep(MessageSecurityMode.Sign, SP.Basic256Sha256, 2),
      ];
      expect(() =>
        OpcUaClient.selectBestEndpoint(endpoints, MessageSecurityMode.SignAndEncrypt),
      ).toThrow(/securityMode/);
    });

    it('throws on empty endpoints with modeFilter', () => {
      expect(() =>
        OpcUaClient.selectBestEndpoint([], MessageSecurityMode.SignAndEncrypt),
      ).toThrow(/no endpoints/i);
    });

    it('error message lists available modes', () => {
      const endpoints = [
        ep(MessageSecurityMode.None, SP.None, 0),
        ep(MessageSecurityMode.Sign, SP.Basic256Sha256, 2),
      ];
      try {
        OpcUaClient.selectBestEndpoint(endpoints, MessageSecurityMode.SignAndEncrypt);
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('None');
        expect(err.message).toContain('Sign');
      }
    });
  });

  // ── policyFilter (Auto mode + explicit policy) ────────────

  describe('policyFilter (Auto mode + explicit policy)', () => {
    it('finds best mode for Basic256Sha256', () => {
      const result = OpcUaClient.selectBestEndpoint(
        REALISTIC_ENDPOINTS,
        undefined,
        SP.Basic256Sha256,
      );
      // Should pick SignAndEncrypt (securityLevel=3) over Sign (2)
      expect(result.securityMode).toBe(MessageSecurityMode.SignAndEncrypt);
      expect(result.securityPolicy).toContain('Basic256Sha256');
    });

    it('finds best mode for deprecated policy', () => {
      const result = OpcUaClient.selectBestEndpoint(
        REALISTIC_ENDPOINTS,
        undefined,
        SP.Basic128Rsa15,
      );
      expect(result.securityMode).toBe(MessageSecurityMode.SignAndEncrypt);
      expect(result.securityPolicy).toContain('Basic128Rsa15');
    });

    it('throws when no endpoints match the policy', () => {
      const endpoints = [ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 3)];
      expect(() =>
        OpcUaClient.selectBestEndpoint(endpoints, undefined, SP.Aes256_Sha256_RsaPss),
      ).toThrow(/securityPolicy/);
    });

    it('error message lists available policies', () => {
      const endpoints = [ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 3)];
      try {
        OpcUaClient.selectBestEndpoint(endpoints, undefined, SP.Aes256_Sha256_RsaPss);
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('Basic256Sha256');
      }
    });
  });

  // ── Both filters (explicit mode + explicit policy) ────────

  describe('both filters (explicit mode + explicit policy)', () => {
    it('finds exact match', () => {
      const result = OpcUaClient.selectBestEndpoint(
        REALISTIC_ENDPOINTS,
        MessageSecurityMode.Sign,
        SP.Basic256Sha256,
      );
      expect(result.securityMode).toBe(MessageSecurityMode.Sign);
      expect(result.securityPolicy).toContain('Basic256Sha256');
    });

    it('throws when mode matches but policy does not', () => {
      const endpoints = [ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 3)];
      expect(() =>
        OpcUaClient.selectBestEndpoint(
          endpoints,
          MessageSecurityMode.SignAndEncrypt,
          SP.Aes256_Sha256_RsaPss,
        ),
      ).toThrow(/securityPolicy/);
    });

    it('throws when policy matches but mode does not', () => {
      const endpoints = [ep(MessageSecurityMode.Sign, SP.Basic256Sha256, 2)];
      expect(() =>
        OpcUaClient.selectBestEndpoint(
          endpoints,
          MessageSecurityMode.SignAndEncrypt,
          SP.Basic256Sha256,
        ),
      ).toThrow(/securityMode/);
    });
  });

  // ── Edge cases ────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles unknown policy URIs (ranked last)', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, 'http://example.com/CustomPolicy', 3),
        ep(MessageSecurityMode.SignAndEncrypt, SP.Basic256Sha256, 3),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      // Known policy ranks higher than unknown
      expect(result.securityPolicy).toContain('Basic256Sha256');
    });

    it('ranks deprecated policies below modern ones', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, SP.Basic128Rsa15, 3),
        ep(MessageSecurityMode.SignAndEncrypt, SP.Aes128_Sha256_RsaOaep, 3),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      expect(result.securityPolicy).toContain('Aes128_Sha256_RsaOaep');
    });

    it('single endpoint returns that endpoint', () => {
      const endpoints = [ep(MessageSecurityMode.Sign, SP.Basic256, 1)];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      expect(result.securityMode).toBe(MessageSecurityMode.Sign);
      expect(result.securityPolicy).toContain('Basic256');
    });
  });
});
