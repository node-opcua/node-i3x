import { cosmiconfig } from 'cosmiconfig';
import { load as loadYaml } from 'js-yaml';

export interface I3xConfig {
  endpoint: string;
  port: number;
  host: string;
  securityMode: string;
  securityPolicy: string;
  pkiFolder?: string;
  certificateSubject?: string;
  optimizedClient: 'auto' | 'disabled';
  publishIntervalMs: number;
  samplingIntervalMs: number;
  logLevel: string;
  preload: boolean;
  preloadStrict: boolean;
  readOnly: boolean;
  experimental: boolean;
  username?: string;
  password?: string;
  apiKey?: string;
}

const DEFAULTS: I3xConfig = {
  endpoint: 'opc.tcp://localhost:4840',
  port: 8080,
  host: '0.0.0.0',
  securityMode: 'Auto',
  securityPolicy: 'Auto',
  optimizedClient: 'auto',
  publishIntervalMs: 1000,
  samplingIntervalMs: 250,
  logLevel: 'info',
  preload: true,
  preloadStrict: false,
  readOnly: false,
  experimental: false,
};

// ── Environment variable helpers ───────────────────────────
function envStr(key: string): string | undefined {
  return process.env[key];
}
function envInt(key: string): number | undefined {
  const v = process.env[key];
  return v ? parseInt(v, 10) : undefined;
}
function envBool(key: string): boolean | undefined {
  const v = process.env[key];
  if (!v) return undefined;
  return v === '1' || v.toLowerCase() === 'true';
}

function fromEnv(): Partial<I3xConfig> {
  const result: Partial<I3xConfig> = {};
  const endpoint = envStr('NODE_I3X_OPCUA_ENDPOINT') ?? envStr('NODE_I3X_ENDPOINT');
  if (endpoint) result.endpoint = endpoint;

  const port = envInt('NODE_I3X_PORT');
  if (port !== undefined) result.port = port;

  const host = envStr('NODE_I3X_HOST');
  if (host) result.host = host;

  const securityMode = envStr('NODE_I3X_OPCUA_SECURITY_MODE');
  if (securityMode) result.securityMode = securityMode;

  const securityPolicy = envStr('NODE_I3X_OPCUA_SECURITY_POLICY');
  if (securityPolicy) result.securityPolicy = securityPolicy;

  const pkiFolder = envStr('NODE_I3X_PKI_FOLDER');
  if (pkiFolder) result.pkiFolder = pkiFolder;

  const certSubject = envStr('NODE_I3X_CERTIFICATE_SUBJECT');
  if (certSubject) result.certificateSubject = certSubject;

  const optimizedClient = envStr('NODE_I3X_OPCUA_OPTIMIZED_CLIENT');
  if (optimizedClient === 'auto' || optimizedClient === 'disabled')
    result.optimizedClient = optimizedClient;

  const publishInterval = envInt('NODE_I3X_PUBLISH_INTERVAL_MS');
  if (publishInterval !== undefined) result.publishIntervalMs = publishInterval;

  const samplingInterval = envInt('NODE_I3X_SAMPLING_INTERVAL_MS');
  if (samplingInterval !== undefined) result.samplingIntervalMs = samplingInterval;

  const logLevel = envStr('NODE_I3X_LOG_LEVEL');
  if (logLevel) result.logLevel = logLevel;

  const preload = envBool('NODE_I3X_PRELOAD');
  if (preload !== undefined) result.preload = preload;

  const preloadStrict = envBool('NODE_I3X_PRELOAD_STRICT');
  if (preloadStrict !== undefined) result.preloadStrict = preloadStrict;

  const username = envStr('NODE_I3X_OPCUA_USERNAME');
  if (username) result.username = username;

  const password = envStr('NODE_I3X_OPCUA_PASSWORD');
  if (password) result.password = password;

  const readOnly = envBool('NODE_I3X_READ_ONLY');
  if (readOnly !== undefined) result.readOnly = readOnly;

  const experimental = envBool('NODE_I3X_EXPERIMENTAL');
  if (experimental !== undefined) result.experimental = experimental;

  const apiKey = envStr('NODE_I3X_API_KEY');
  if (apiKey) result.apiKey = apiKey;

  return result;
}

// ── Config file discovery ──────────────────────────────────
export async function resolveConfig(
  cliArgs: Partial<I3xConfig>,
  configPath?: string,
): Promise<I3xConfig> {
  // 1. Load config file (i3x.config.yml, i3x.config.json, ...)
  let fileConfig: Partial<I3xConfig> = {};
  const explorer = cosmiconfig('i3x', {
    searchPlaces: [
      'i3x.config.yml',
      'i3x.config.yaml',
      'i3x.config.json',
      '.i3xrc',
      '.i3xrc.json',
      '.i3xrc.yml',
      '.i3xrc.yaml',
      'package.json',
    ],
    loaders: {
      '.yml': (_filepath: string, content: string) => loadYaml(content),
      '.yaml': (_filepath: string, content: string) => loadYaml(content),
    },
  });

  try {
    const result = configPath ? await explorer.load(configPath) : await explorer.search();
    if (result && !result.isEmpty) {
      fileConfig = result.config as Partial<I3xConfig>;
    }
  } catch (err) {
    console.debug(`No config file loaded: ${(err as Error).message}`);
  }

  // 2. Layer: defaults < config file < env vars < CLI args
  const envConfig = fromEnv();

  return {
    ...DEFAULTS,
    ...fileConfig,
    ...envConfig,
    ...cliArgs,
  };
}
