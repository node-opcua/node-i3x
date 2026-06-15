// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — OPC UA-specific internal types
// ─────────────────────────────────────────────────────────────

import type { BrowseFilter } from '@node-i3x/core';

/** Configuration for the OPC UA client connection. */
export interface OpcUaClientOptions {
  endpointUrl: string;
  /**
   * OPC UA security mode.
   * - `'None'` | `'Sign'` | `'SignAndEncrypt'` — explicit mode.
   * - `'Auto'` — discover endpoints and pick the strongest
   *   SecurityPolicy + SecurityMode combination.
   * @default 'Auto'
   */
  securityMode?: 'None' | 'Sign' | 'SignAndEncrypt' | 'Auto';
  /**
   * OPC UA security policy (e.g. `'Basic256Sha256'`).
   * Only used when securityMode is NOT `'Auto'`. When `'Auto'`
   * is selected, the policy is discovered from the server.
   * @default 'None'
   */
  securityPolicy?: string;
  applicationName?: string;
  /**
   * OPC UA application URI embedded in the client certificate.
   * @default `urn:<hostname>:<applicationName>`
   */
  applicationUri?: string;
  /**
   * Root folder for this client instance's PKI store.
   * Each bridge instance should use a separate folder to
   * avoid file contention when running multiple processes.
   * @default auto-generated under `<cwd>/pki/` from endpoint URL hash
   */
  pkiFolder?: string;
  /**
   * Custom X.500 subject for the self-signed client certificate.
   * Use this to inject distinguishing markers (e.g. user email,
   * portal name) into the certificate.
   *
   * Example: `/CN=node-i3x-abc123/O=Sterfive/OU=john@acme.com`
   *
   * @default `/CN=<applicationName>-<hash>/O=Sterfive/L=Orleans/C=FR`
   */
  certificateSubject?: string;
  optimizedClient?: 'auto' | 'disabled';
  /**
   * Browse strategy for tree discovery.
   * - `'parallel'` (default): parallel browse() + browseNext()
   *   per BFS wave using Promise.all — 18x faster.
   * - `'browseAll'`: node-opcua browseAll() which handles
   *   continuation points internally but serializes.
   */
  browseStrategy?: 'parallel' | 'browseAll';
  /**
   * Controls which top-level objects under the ObjectsFolder
   * are exposed by browseTree().
   *
   * - `'application-only'` — skip ns=0 infrastructure nodes
   *   (`Server`, `Aliases`, …).  **Default.**
   * - `'all'` — expose every child of ObjectsFolder.
   * - `string[]` — explicit list of NodeIds or BrowseNames
   *   to include (e.g. `['ns=1;s=SmartFactory']`).
   */
  browseFilter?: BrowseFilter;
  /** OPC UA username for UserName identity token. */
  username?: string;
  /** OPC UA password for UserName identity token. */
  password?: string;
}
