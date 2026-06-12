// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — OPC UA-specific internal types
// ─────────────────────────────────────────────────────────────

import type { BrowseFilter } from '@node-i3x/core';

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
}
