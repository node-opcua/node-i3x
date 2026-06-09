// ─────────────────────────────────────────────────────────────
// Type stub for @sterfive/opcua-optimized-client
// ─────────────────────────────────────────────────────────────
// This optional dependency may not be installed. This stub
// provides minimal type declarations so TypeScript compiles
// without errors when the package is absent.
// When the real package IS installed, its own types take
// precedence over this stub (node resolution order).

declare module '@sterfive/opcua-optimized-client' {
  import type { ClientSession } from 'node-opcua';

  export class ClientSessionOptimized {
    constructor(session: ClientSession);
  }
}
