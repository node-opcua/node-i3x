// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — OPC UA-specific internal types
// ─────────────────────────────────────────────────────────────

/** Configuration for the OPC UA client connection. */
export interface OpcUaClientOptions {
  endpointUrl: string;
  securityMode?: string;
  applicationName?: string;
  optimizedClient?: 'auto' | 'disabled';
  /**
   * Browse strategy for tree discovery.
   * - `'parallel'` (default): parallel browse() + browseNext()
   *   per BFS wave using Promise.all — 18x faster.
   * - `'browseAll'`: node-opcua browseAll() which handles
   *   continuation points internally but serializes.
   */
  browseStrategy?: 'parallel' | 'browseAll';
}
