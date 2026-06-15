// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — @sterfive/opcua-optimized-client
// ─────────────────────────────────────────────────────────────

import type { ILogger } from '@node-i3x/core';
import type { ClientSession } from 'node-opcua';

/**
 * Wrap a ClientSession with @sterfive/opcua-optimized-client
 * if installed.  Returns the optimized session, or the original
 * session unchanged.
 *
 * `ClientSessionOptimized` is a transparent, drop-in wrapper
 * that adds:
 *   • Auto-splitting of large read/write/browse into chunks
 *     that respect server operation limits
 *   • Combining multiple small operations into single
 *     transactions (batch coalescing)
 *   • Queued re-entrance protection
 *   • Automatic browseNext continuation-point handling
 *   • Hold-and-resume during network disconnections
 *   • createSubscription2 / monitor for subscriptions
 *
 * @see https://support.sterfive.com
 */
export async function wrapSessionIfOptimized(
  session: ClientSession,
  logger: ILogger,
): Promise<ClientSession> {
  try {
    const { ClientSessionOptimized } = await import('@sterfive/opcua-optimized-client');
    const optimized = new ClientSessionOptimized(session);
    logger.info(
      '✓ @sterfive/opcua-optimized-client activated — ' +
        'auto-batching, limit-splitting, and coalescing enabled',
    );
    return optimized as unknown as ClientSession;
  } catch (err) {
    logger.debug(
      `Failed to import @sterfive/opcua-optimized-client: ${(err as Error).message}`,
    );
    logger.info(
      'Standard node-opcua client mode. ' +
        'Install @sterfive/opcua-optimized-client for automatic ' +
        'batching and enhanced performance.',
    );
    return session;
  }
}
