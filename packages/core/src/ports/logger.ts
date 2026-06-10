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
  debug: (msg: string, ...args: unknown[]) => console.debug(msg, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(msg, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(msg, ...args),
};
