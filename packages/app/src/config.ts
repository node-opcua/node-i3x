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
  opcuaEndpoint: env('NODE_I3X_OPCUA_ENDPOINT', 'opc.tcp://localhost:4840'),
  opcuaSecurityMode: env('NODE_I3X_OPCUA_SECURITY_MODE', 'None'),
  opcuaOptimizedClient: env(
    'NODE_I3X_OPCUA_OPTIMIZED_CLIENT',
    'auto',
  ) as Config['opcuaOptimizedClient'],
  modelPreloadOnStartup: envBool('NODE_I3X_PRELOAD', true),
  failStartupOnModelPreloadError: envBool(
    'NODE_I3X_PRELOAD_STRICT',
    false,
  ),
  subscriptionIntervalSeconds: envInt('NODE_I3X_PUBLISH_INTERVAL', 5),
  logLevel: env('NODE_I3X_LOG_LEVEL', 'info'),
  port: envInt('NODE_I3X_PORT', 8000),
  host: env('NODE_I3X_HOST', '127.0.0.1'),
};
