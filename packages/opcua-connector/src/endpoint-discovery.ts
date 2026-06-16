// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — endpoint discovery & selection
// ─────────────────────────────────────────────────────────────

import type { ILogger } from '@node-i3x/core';
import { MessageSecurityMode, OPCUAClient } from 'node-opcua';
import { coerceSecurityPolicy, type SecurityPolicy } from 'node-opcua-secure-channel';

/**
 * Security policies ranked strongest (index 0) to weakest.
 * Deprecated policies (Basic256, Basic128Rsa15, etc.) are
 * deprioritized but not excluded — the server may only offer
 * legacy policies and we must still be able to connect.
 */
export const SECURITY_POLICY_RANK: string[] = [
  'http://opcfoundation.org/UA/SecurityPolicy#Aes256_Sha256_RsaPss',
  'http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256',
  'http://opcfoundation.org/UA/SecurityPolicy#Aes128_Sha256_RsaOaep',
  'http://opcfoundation.org/UA/SecurityPolicy#Basic256',
  'http://opcfoundation.org/UA/SecurityPolicy#Basic256Rsa15',
  'http://opcfoundation.org/UA/SecurityPolicy#Basic128Rsa15',
  'http://opcfoundation.org/UA/SecurityPolicy#None',
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
  securityPolicy: SecurityPolicy;
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
  securityPolicy: SecurityPolicy;
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
    await discoveryClient.connect(endpointUrl);
    const endpoints = await discoveryClient.getEndpoints();
    await discoveryClient.disconnect();

    const result = selectBestEndpoint(
      endpoints as EndpointLike[],
      modeFilter,
      policyFilter,
    );

    logger.info(
      `Auto-discovered best endpoint: ` +
        `securityPolicy=${result.securityPolicy} ` +
        `securityMode=` +
        `${MessageSecurityMode[result.securityMode]}`,
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
