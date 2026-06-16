// ─────────────────────────────────────────────────────────────
// Unit tests for OpcUaClient.selectBestEndpoint
// ─────────────────────────────────────────────────────────────

import { MessageSecurityMode } from 'node-opcua';
import { SecurityPolicy } from 'node-opcua-secure-channel';
import { describe, expect, it } from 'vitest';
import {
  coerceMessageSecurityMode,
  coercePolicyToUri,
  type EndpointLike,
  selectBestEndpoint,
} from '../src/endpoint-discovery.js';
import { OpcUaClient } from '../src/opcua-client.js';

// ── Helpers ─────────────────────────────────────────────────

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
  ep(MessageSecurityMode.None, SecurityPolicy.None, 0),
  ep(MessageSecurityMode.Sign, SecurityPolicy.Basic256Sha256, 2),
  ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic256Sha256, 3),
  ep(MessageSecurityMode.Sign, SecurityPolicy.Aes128_Sha256_RsaOaep, 2),
  ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Aes128_Sha256_RsaOaep, 3),
  ep(MessageSecurityMode.Sign, SecurityPolicy.Basic128Rsa15, 1),
  ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic128Rsa15, 2),
  ep(MessageSecurityMode.Sign, SecurityPolicy.Aes256_Sha256_RsaPss, 2),
  ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Aes256_Sha256_RsaPss, 4),
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
      expect(result.securityPolicy).toBe(SecurityPolicy.Aes256_Sha256_RsaPss);
    });

    it('prefers higher securityLevel', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic128Rsa15, 5),
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Aes256_Sha256_RsaPss, 1),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      // Basic128Rsa15 has higher securityLevel=5 despite weaker policy
      expect(result.securityPolicy).toBe(SecurityPolicy.Basic128Rsa15);
    });

    it('uses policy rank as tiebreaker when securityLevel is equal', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic256Sha256, 3),
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Aes256_Sha256_RsaPss, 3),
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Aes128_Sha256_RsaOaep, 3),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      // Aes256_Sha256_RsaPss is rank 0 (strongest)
      expect(result.securityPolicy).toBe(SecurityPolicy.Aes256_Sha256_RsaPss);
    });

    it('prefers SignAndEncrypt over Sign at same level and policy', () => {
      const endpoints = [
        ep(MessageSecurityMode.Sign, SecurityPolicy.Basic256Sha256, 2),
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic256Sha256, 2),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      expect(result.securityMode).toBe(MessageSecurityMode.SignAndEncrypt);
    });

    it('skips None endpoints when secured ones exist', () => {
      const endpoints = [
        ep(MessageSecurityMode.None, SecurityPolicy.None, 0),
        ep(MessageSecurityMode.Sign, SecurityPolicy.Basic256Sha256, 1),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      expect(result.securityMode).toBe(MessageSecurityMode.Sign);
      expect(result.securityPolicy).toBe(SecurityPolicy.Basic256Sha256);
    });

    it('falls back to None when server only offers None', () => {
      const endpoints = [ep(MessageSecurityMode.None, SecurityPolicy.None, 0)];
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
      expect(result.securityPolicy).toBe(SecurityPolicy.Aes256_Sha256_RsaPss);
    });

    it('finds strongest policy for Sign', () => {
      const result = OpcUaClient.selectBestEndpoint(
        REALISTIC_ENDPOINTS,
        MessageSecurityMode.Sign,
      );
      expect(result.securityMode).toBe(MessageSecurityMode.Sign);
      // Aes256 has highest level among Sign endpoints
      expect(result.securityPolicy).toBe(SecurityPolicy.Aes256_Sha256_RsaPss);
    });

    it('throws when no endpoints match the mode', () => {
      const endpoints = [
        ep(MessageSecurityMode.None, SecurityPolicy.None, 0),
        ep(MessageSecurityMode.Sign, SecurityPolicy.Basic256Sha256, 2),
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
        ep(MessageSecurityMode.None, SecurityPolicy.None, 0),
        ep(MessageSecurityMode.Sign, SecurityPolicy.Basic256Sha256, 2),
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
        SecurityPolicy.Basic256Sha256,
      );
      // Should pick SignAndEncrypt (securityLevel=3) over Sign (2)
      expect(result.securityMode).toBe(MessageSecurityMode.SignAndEncrypt);
      expect(result.securityPolicy).toBe(SecurityPolicy.Basic256Sha256);
    });

    it('finds best mode for deprecated policy', () => {
      const result = OpcUaClient.selectBestEndpoint(
        REALISTIC_ENDPOINTS,
        undefined,
        SecurityPolicy.Basic128Rsa15,
      );
      expect(result.securityMode).toBe(MessageSecurityMode.SignAndEncrypt);
      expect(result.securityPolicy).toBe(SecurityPolicy.Basic128Rsa15);
    });

    it('throws when no endpoints match the policy', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic256Sha256, 3),
      ];
      expect(() =>
        OpcUaClient.selectBestEndpoint(
          endpoints,
          undefined,
          SecurityPolicy.Aes256_Sha256_RsaPss,
        ),
      ).toThrow(/securityPolicy/);
    });

    it('error message lists available policies', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic256Sha256, 3),
      ];
      try {
        OpcUaClient.selectBestEndpoint(
          endpoints,
          undefined,
          SecurityPolicy.Aes256_Sha256_RsaPss,
        );
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
        SecurityPolicy.Basic256Sha256,
      );
      expect(result.securityMode).toBe(MessageSecurityMode.Sign);
      expect(result.securityPolicy).toBe(SecurityPolicy.Basic256Sha256);
    });

    it('throws when mode matches but policy does not', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic256Sha256, 3),
      ];
      expect(() =>
        OpcUaClient.selectBestEndpoint(
          endpoints,
          MessageSecurityMode.SignAndEncrypt,
          SecurityPolicy.Aes256_Sha256_RsaPss,
        ),
      ).toThrow(/securityPolicy/);
    });

    it('throws when policy matches but mode does not', () => {
      const endpoints = [ep(MessageSecurityMode.Sign, SecurityPolicy.Basic256Sha256, 2)];
      expect(() =>
        OpcUaClient.selectBestEndpoint(
          endpoints,
          MessageSecurityMode.SignAndEncrypt,
          SecurityPolicy.Basic256Sha256,
        ),
      ).toThrow(/securityMode/);
    });
  });

  // ── Edge cases ────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles unknown policy URIs (ranked last)', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, 'http://example.com/CustomPolicy', 3),
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic256Sha256, 3),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      // Known policy ranks higher than unknown
      expect(result.securityPolicy).toBe(SecurityPolicy.Basic256Sha256);
    });

    it('ranks deprecated policies below modern ones', () => {
      const endpoints = [
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Basic128Rsa15, 3),
        ep(MessageSecurityMode.SignAndEncrypt, SecurityPolicy.Aes128_Sha256_RsaOaep, 3),
      ];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      expect(result.securityPolicy).toBe(SecurityPolicy.Aes128_Sha256_RsaOaep);
    });

    it('single endpoint returns that endpoint', () => {
      const endpoints = [ep(MessageSecurityMode.Sign, SecurityPolicy.Basic256, 1)];
      const result = OpcUaClient.selectBestEndpoint(endpoints);
      expect(result.securityMode).toBe(MessageSecurityMode.Sign);
      expect(result.securityPolicy).toBe(SecurityPolicy.Basic256);
    });
  });

  // ── selectBestEndpoint standalone function ────────────────

  describe('standalone selectBestEndpoint function', () => {
    it('works identically to the static method', () => {
      const viaStatic = OpcUaClient.selectBestEndpoint(REALISTIC_ENDPOINTS);
      const viaFunction = selectBestEndpoint(REALISTIC_ENDPOINTS);
      expect(viaFunction).toEqual(viaStatic);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// coerceMessageSecurityMode
// ═══════════════════════════════════════════════════════════════

describe('coerceMessageSecurityMode', () => {
  it('coerces "None" to MessageSecurityMode.None', () => {
    expect(coerceMessageSecurityMode('None')).toBe(MessageSecurityMode.None);
  });

  it('coerces "Sign" to MessageSecurityMode.Sign', () => {
    expect(coerceMessageSecurityMode('Sign')).toBe(MessageSecurityMode.Sign);
  });

  it('coerces "SignAndEncrypt" to MessageSecurityMode.SignAndEncrypt', () => {
    expect(coerceMessageSecurityMode('SignAndEncrypt')).toBe(
      MessageSecurityMode.SignAndEncrypt,
    );
  });

  it('throws on invalid mode', () => {
    expect(() => coerceMessageSecurityMode('Invalid')).toThrow(/Invalid.*security mode/);
  });

  it('throws on empty string', () => {
    expect(() => coerceMessageSecurityMode('')).toThrow(/Invalid.*security mode/);
  });

  it('is case-sensitive', () => {
    expect(() => coerceMessageSecurityMode('sign')).toThrow(/Invalid.*security mode/);
    expect(() => coerceMessageSecurityMode('SIGN')).toThrow(/Invalid.*security mode/);
  });
});

// ═══════════════════════════════════════════════════════════════
// coercePolicyToUri
// ═══════════════════════════════════════════════════════════════

describe('coercePolicyToUri', () => {
  it('coerces "None" to SecurityPolicy.None', () => {
    expect(coercePolicyToUri('None')).toBe(SecurityPolicy.None);
  });

  it('coerces "Basic256Sha256" to SecurityPolicy.Basic256Sha256', () => {
    expect(coercePolicyToUri('Basic256Sha256')).toBe(SecurityPolicy.Basic256Sha256);
  });

  it('coerces "Aes256_Sha256_RsaPss" to SecurityPolicy.Aes256_Sha256_RsaPss', () => {
    expect(coercePolicyToUri('Aes256_Sha256_RsaPss')).toBe(
      SecurityPolicy.Aes256_Sha256_RsaPss,
    );
  });

  it('coerces "Aes128_Sha256_RsaOaep" to SecurityPolicy.Aes128_Sha256_RsaOaep', () => {
    expect(coercePolicyToUri('Aes128_Sha256_RsaOaep')).toBe(
      SecurityPolicy.Aes128_Sha256_RsaOaep,
    );
  });

  it('passes through full URIs unchanged', () => {
    const uri = SecurityPolicy.Basic256Sha256;
    expect(coercePolicyToUri(uri)).toBe(uri);
  });

  it('passes through custom full URIs unchanged', () => {
    const custom = 'http://example.com/CustomPolicy';
    expect(coercePolicyToUri(custom)).toBe(custom);
  });
});
