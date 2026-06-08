// ─────────────────────────────────────────────────────────────
// @i3x/core  —  Namespace value object
// ─────────────────────────────────────────────────────────────

/** An i3X namespace (maps 1-to-1 from OPC UA namespace table). */
export interface Namespace {
  readonly uri: string;
  readonly displayName: string;
}
