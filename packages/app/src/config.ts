import 'dotenv/config';

export interface Config {
  opcuaEndpoint: string;
  opcuaSecurityMode: string;
  opcuaOptimizedClient: 'auto' | 'disabled';
  modelPreloadOnStartup: boolean;
  failStartupOnModelPreloadError: boolean;
  subscriptionIntervalSeconds: number;
  logLevel: string;
  skipOpcuaConnect: boolean;
  port: number;
  host: string;
}

function env(key: string, def: string): string {
  return process.env[key] ?? def;
}
function envBool(key: string, def: boolean): boolean {
  const v = process.env[key];
  if (!v) return def;
  return v === '1' || v.toLowerCase() === 'true';
}
function envInt(key: string, def: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : def;
}

export const config: Config = {
  opcuaEndpoint: env('I3X_OPCUA_ENDPOINT', 'opc.tcp://localhost:4840'),
  opcuaSecurityMode: env('I3X_OPCUA_SECURITY_MODE', 'None'),
  opcuaOptimizedClient: env(
    'I3X_OPCUA_OPTIMIZED_CLIENT',
    'auto',
  ) as Config['opcuaOptimizedClient'],
  modelPreloadOnStartup: envBool('I3X_MODEL_PRELOAD_ON_STARTUP', true),
  failStartupOnModelPreloadError: envBool(
    'I3X_FAIL_STARTUP_ON_MODEL_PRELOAD_ERROR',
    false,
  ),
  subscriptionIntervalSeconds: envInt('I3X_SUBSCRIPTION_INTERVAL_SECONDS', 5),
  logLevel: env('I3X_LOG_LEVEL', 'info'),
  skipOpcuaConnect: envBool('I3X_SKIP_OPCUA_CONNECT', false),
  port: envInt('I3X_PORT', 8000),
  host: env('I3X_HOST', '127.0.0.1'),
};
