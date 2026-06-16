import type { ILogger } from '@node-i3x/core';
import { MessageSecurityMode, OPCUAClient } from 'node-opcua';
import {
  coerceSecurityPolicy,
  SecurityPolicy,
  type SecurityPolicy as SecurityPolicyType,
} from 'node-opcua-secure-channel';

/**
 * Security policies ranked strongest (index 0) to weakest.
 * Uses `SecurityPolicy` enum from node-opcua to avoid
 * error-prone hardcoded URI strings.
 *
 * Deprecated policies (Basic256, Basic128Rsa15, etc.) are
 * deprioritized but not excluded — the server may only offer
 * legacy policies and we must still be able to connect.
 */
export const SECURITY_POLICY_RANK: string[] = [
  SecurityPolicy.Aes256_Sha256_RsaPss,
  SecurityPolicy.Basic256Sha256,
  SecurityPolicy.Aes128_Sha256_RsaOaep,
  SecurityPolicy.Basic256,
  SecurityPolicy.Basic256Rsa15,
  SecurityPolicy.Basic128Rsa15,
  SecurityPolicy.None,
];

export const SECURITY_MODE_RANK: Record<number, number> = {
  [MessageSecurityMode.SignAndEncrypt]: 0,
  [MessageSecurityMode.Sign]: 1,
  [MessageSecurityMode.None]: 2,
};

export const SECURITY_MODES: Record<string, MessageSecurityMode> = {
  None: MessageSecurityMode.None,
  Sign: MessageSecurityMode.Sign,
  SignAndEncrypt: MessageSecurityMode.SignAndEncrypt,
};

/**
 * Map of short policy names → full OPC UA policy URIs,
 * derived from the `SecurityPolicy` object in node-opcua.
 */
export const SECURITY_POLICY_URI: Record<string, string> = {
  None: SecurityPolicy.None,
  Basic128Rsa15: SecurityPolicy.Basic128Rsa15,
  Basic256: SecurityPolicy.Basic256,
  Basic256Rsa15: SecurityPolicy.Basic256Rsa15,
  Basic256Sha256: SecurityPolicy.Basic256Sha256,
  Aes128_Sha256_RsaOaep: SecurityPolicy.Aes128_Sha256_RsaOaep,
  Aes256_Sha256_RsaPss: SecurityPolicy.Aes256_Sha256_RsaPss,
};

/**
 * Coerce a string security mode name to the node-opcua
 * `MessageSecurityMode` enum.  Throws if the name is invalid.
 *
 * @example
 *   coerceMessageSecurityMode('Sign')
 *   // → MessageSecurityMode.Sign (= 2)
 */
export function coerceMessageSecurityMode(mode: string): MessageSecurityMode {
  const result = SECURITY_MODES[mode];
  if (result === undefined) {
    throw new Error(
      `Invalid OPC UA security mode '${mode}'. ` +
        `Must be one of: ${Object.keys(SECURITY_MODES).join(', ')}.`,
    );
  }
  return result;
}

/**
 * Coerce a short security policy name (e.g. 'Basic256Sha256')
 * to the full OPC UA SecurityPolicy URI.  Also accepts full
 * URIs (returned as-is) and the node-opcua SecurityPolicy
 * type via `coerceSecurityPolicy`.
 *
 * @example
 *   coercePolicyToUri('Basic256Sha256')
 *   // → 'http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256'
 */
export function coercePolicyToUri(policy: string): string {
  // Already a full URI?
  if (policy.startsWith('http://')) return policy;

  const uri = SECURITY_POLICY_URI[policy];
  if (uri) return uri;

  // Fallback: try node-opcua's coercion
  return coerceSecurityPolicy(policy);
}

/**
 * Minimal endpoint shape for `selectBestEndpoint`.
 * Mirrors the fields of `EndpointDescription` used in ranking.
 */
export interface EndpointLike {
  securityMode: MessageSecurityMode;
  securityPolicyUri?: string;
  securityLevel?: number;
}

/**
 * Select the best endpoint from a list of endpoint
 * descriptions.  Pure ranking logic extracted from
 * `_discoverBestEndpoint` for unit-testing.
 */
export function selectBestEndpoint(
  endpoints: EndpointLike[],
  modeFilter?: MessageSecurityMode,
  policyFilter?: string,
): {
  securityMode: MessageSecurityMode;
  securityPolicy: SecurityPolicyType;
} {
  if (endpoints.length === 0) {
    if (modeFilter !== undefined || policyFilter !== undefined) {
      throw new Error(
        'Server returned no endpoints. Cannot discover ' +
          'a matching security configuration.',
      );
    }
    return {
      securityMode: MessageSecurityMode.None,
      securityPolicy: coerceSecurityPolicy('None'),
    };
  }

  // ── Build candidate pool ──────────────────────────────
  let pool = [...endpoints];

  if (modeFilter !== undefined) {
    const filtered = pool.filter((ep) => ep.securityMode === modeFilter);
    if (filtered.length === 0) {
      throw new Error(
        `Server has no endpoints with securityMode=` +
          `${MessageSecurityMode[modeFilter]}. ` +
          `Available modes: ${[
            ...new Set(pool.map((ep) => MessageSecurityMode[ep.securityMode])),
          ].join(', ')}.`,
      );
    }
    pool = filtered;
  }

  if (policyFilter !== undefined) {
    const filtered = pool.filter((ep) => ep.securityPolicyUri === policyFilter);
    if (filtered.length === 0) {
      throw new Error(
        `Server has no endpoints with ` +
          `securityPolicy=${policyFilter}. ` +
          `Available policies: ${[
            ...new Set(pool.map((ep) => ep.securityPolicyUri)),
          ].join(', ')}.`,
      );
    }
    pool = filtered;
  }

  // When no filters, prefer secured endpoints
  if (modeFilter === undefined && policyFilter === undefined) {
    const secured = pool.filter((ep) => ep.securityMode !== MessageSecurityMode.None);
    if (secured.length > 0) pool = secured;
  }

  // ── Rank candidates ───────────────────────────────────
  pool.sort((a, b) => {
    const levelDiff = (b.securityLevel ?? 0) - (a.securityLevel ?? 0);
    if (levelDiff !== 0) return levelDiff;

    const pA = SECURITY_POLICY_RANK.indexOf(a.securityPolicyUri ?? '');
    const pB = SECURITY_POLICY_RANK.indexOf(b.securityPolicyUri ?? '');
    const policyDiff = (pA === -1 ? 999 : pA) - (pB === -1 ? 999 : pB);
    if (policyDiff !== 0) return policyDiff;

    return (
      (SECURITY_MODE_RANK[a.securityMode] ?? 9) -
      (SECURITY_MODE_RANK[b.securityMode] ?? 9)
    );
  });

  const best = pool[0]!;
  return {
    securityMode: best.securityMode,
    securityPolicy: coerceSecurityPolicy(best.securityPolicyUri),
  };
}

/**
 * Discover available endpoints from the server and select
 * the strongest SecurityPolicy + SecurityMode combination.
 *
 * @param endpointUrl  The server endpoint to discover.
 * @param logger       Logger instance for diagnostics.
 * @param modeFilter   Only consider endpoints with this mode.
 * @param policyFilter Only consider endpoints with this
 *   policy URI.
 */
export async function discoverBestEndpoint(
  endpointUrl: string,
  logger: ILogger,
  modeFilter?: MessageSecurityMode,
  policyFilter?: string,
): Promise<{
  securityMode: MessageSecurityMode;
  securityPolicy: SecurityPolicyType;
}> {
  const hasFilter = modeFilter !== undefined || policyFilter !== undefined;

  const discoveryClient = OPCUAClient.create({
    connectionStrategy: {
      maxRetry: 3,
      initialDelay: 500,
      maxDelay: 5_000,
    },
    endpointMustExist: false,
  });

  try {
    logger.info(
      `[discovery] Connecting to ${endpointUrl} ` +
        `(mode=None/policy=None for GetEndpoints)...`,
    );
    await discoveryClient.connect(endpointUrl);

    const endpoints = await discoveryClient.getEndpoints();
    await discoveryClient.disconnect();

    // ── Log all server-reported endpoints ────────────────
    logger.info(`[discovery] Server returned ${endpoints.length} ` + `endpoint(s):`);
    for (const ep of endpoints) {
      const modeName =
        MessageSecurityMode[ep.securityMode] ?? `Unknown(${ep.securityMode})`;
      logger.info(
        `  • mode=${modeName}, ` +
          `policy=${ep.securityPolicyUri}, ` +
          `securityLevel=${ep.securityLevel ?? 0}`,
      );
    }

    if (modeFilter !== undefined || policyFilter !== undefined) {
      logger.info(
        `[discovery] Applying filters: ` +
          `mode=${modeFilter !== undefined ? MessageSecurityMode[modeFilter] : 'any'}, ` +
          `policy=${policyFilter ?? 'any'}`,
      );
    }

    const result = selectBestEndpoint(
      endpoints as EndpointLike[],
      modeFilter,
      policyFilter,
    );

    logger.info(
      `[discovery] Selected best endpoint: ` +
        `mode=${MessageSecurityMode[result.securityMode]} ` +
        `(enum=${result.securityMode}), ` +
        `policy=${result.securityPolicy}`,
    );
    return result;
  } catch (err) {
    // When filters were set, propagate — don't silently
    // downgrade to None.
    if (hasFilter) {
      try {
        await discoveryClient.disconnect();
      } catch (discoveryDisconnectErr) {
        logger.debug(
          `discoveryClient disconnect failed: ${(discoveryDisconnectErr as Error).message}`,
        );
      }
      throw err;
    }

    logger.warn(`Endpoint discovery failed (${err}); ` + `falling back to None/None`);
    try {
      await discoveryClient.disconnect();
    } catch (discoveryDisconnectErr) {
      logger.debug(
        `discoveryClient disconnect failed: ${(discoveryDisconnectErr as Error).message}`,
      );
    }
    return {
      securityMode: MessageSecurityMode.None,
      securityPolicy: coerceSecurityPolicy('None'),
    };
  }
}
