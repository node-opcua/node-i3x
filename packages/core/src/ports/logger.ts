// ─────────────────────────────────────────────────────────────
// @node-i3x/core  —  ILogger port (outbound)
// ─────────────────────────────────────────────────────────────

/**
 * Logger port so the domain never depends on pino / winston / console.
 * Adapters inject a concrete logger at composition time.
 */
export interface ILogger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export const nullLogger: ILogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export const consoleLogger: ILogger = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
