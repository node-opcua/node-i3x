// ─────────────────────────────────────────────────────────────
// @i3x/opcua-connector — OPC UA-specific internal types
// ─────────────────────────────────────────────────────────────

/** Configuration for the OPC UA client connection. */
export interface OpcUaClientOptions {
  endpointUrl: string;
  securityMode?: string;
  applicationName?: string;
  optimizedClient?: 'auto' | 'disabled';
}
