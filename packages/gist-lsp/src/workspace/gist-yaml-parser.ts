import * as fs from 'fs';
import * as yaml from 'js-yaml';
import type {
  GistProjectConfig,
  RuntimeConfig,
  FrameworkConfig,
  DatabaseConfig,
  CacheConfig,
  AuthConfig,
  ApiConfig,
  ServiceConfig,
  TestingConfig,
  DeployConfig,
  EnvVarConfig,
  ConventionsConfig,
} from './types.js';

/** Known top-level YAML keys in gist.yaml that are NOT kit sections. */
const KNOWN_KEYS = new Set([
  'project', 'version', 'description',
  'runtime', 'framework', 'database', 'cache', 'auth', 'api',
  'services', 'testing', 'deploy', 'env', 'conventions',
]);

/**
 * Parse a gist.yaml file into a typed project configuration.
 * Unknown top-level keys are collected as kitSections for kit-specific config.
 */
export function parseGistYaml(filePath: string): GistProjectConfig | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseGistYamlContent(content);
  } catch {
    return null;
  }
}

export function parseGistYamlContent(content: string): GistProjectConfig | null {
  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const config: GistProjectConfig = {
    project: asString(obj['project']) ?? '',
    kitSections: {},
  };

  if (obj['version'] !== undefined) config.version = asString(obj['version']);
  if (obj['description'] !== undefined) config.description = asString(obj['description']);
  if (obj['runtime'] !== undefined) config.runtime = parseRuntime(obj['runtime']);
  if (obj['framework'] !== undefined) config.framework = parseFramework(obj['framework']);
  if (obj['database'] !== undefined) config.database = parseDatabase(obj['database']);
  if (obj['cache'] !== undefined) config.cache = parseCache(obj['cache']);
  if (obj['auth'] !== undefined) config.auth = parseAuth(obj['auth']);
  if (obj['api'] !== undefined) config.api = parseApi(obj['api']);
  if (obj['services'] !== undefined) config.services = parseServices(obj['services']);
  if (obj['testing'] !== undefined) config.testing = parseTesting(obj['testing']);
  if (obj['deploy'] !== undefined) config.deploy = parseDeploy(obj['deploy']);
  if (obj['env'] !== undefined) config.env = parseEnv(obj['env']);
  if (obj['conventions'] !== undefined) config.conventions = parseConventions(obj['conventions']);

  // Collect kit-specific sections
  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_KEYS.has(key)) {
      config.kitSections[key] = value;
    }
  }

  return config;
}

// ─── Parsers for each section ─────────────────────────────────

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

function parseRuntime(v: unknown): RuntimeConfig | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  return {
    language: asString(obj['language']),
    platform: asString(obj['platform']),
    version: asString(obj['version']),
    package_manager: asString(obj['package_manager']),
  };
}

function parseFramework(v: unknown): FrameworkConfig | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  return {
    name: asString(obj['name']),
    version: asString(obj['version']),
  };
}

function parseDatabase(v: unknown): DatabaseConfig | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  const conn = asObj(obj['connection']);
  return {
    type: asString(obj['type']),
    version: asString(obj['version']),
    orm: asString(obj['orm']),
    migrations: asString(obj['migrations']),
    connection: conn ? { env: asString(conn['env']) } : undefined,
  };
}

function parseCache(v: unknown): CacheConfig | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  const conn = asObj(obj['connection']);
  return {
    type: asString(obj['type']),
    connection: conn ? { env: asString(conn['env']) } : undefined,
  };
}

function parseAuth(v: unknown): AuthConfig | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  return {
    strategy: asString(obj['strategy']),
    token_expiry: asString(obj['token_expiry']),
    refresh_token: obj['refresh_token'] === true ? true : undefined,
    password_hashing: asString(obj['password_hashing']),
  };
}

function parseApi(v: unknown): ApiConfig | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  const corsObj = asObj(obj['cors']);
  return {
    style: asString(obj['style']),
    prefix: asString(obj['prefix']),
    docs: asString(obj['docs']),
    cors: corsObj ? {
      origins: Array.isArray(corsObj['origins'])
        ? (corsObj['origins'] as unknown[]).map(String)
        : undefined,
    } : undefined,
  };
}

function parseServices(v: unknown): Record<string, ServiceConfig> | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  const result: Record<string, ServiceConfig> = {};
  for (const [name, svcVal] of Object.entries(obj)) {
    const svc = asObj(svcVal);
    if (svc) {
      const authObj = asObj(svc['auth']);
      result[name] = {
        type: asString(svc['type']),
        base_url: asString(svc['base_url']),
        base_url_env: asString(svc['base_url_env']),
        auth: authObj ? {
          type: asString(authObj['type']),
          key_env: asString(authObj['key_env']),
        } : undefined,
      };
    }
  }
  return result;
}

function parseTesting(v: unknown): TestingConfig | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  return {
    framework: asString(obj['framework']),
    coverage: obj['coverage'] === true ? true : undefined,
  };
}

function parseDeploy(v: unknown): DeployConfig | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  return {
    target: asString(obj['target']),
    compose: obj['compose'] === true ? true : undefined,
  };
}

function parseEnv(v: unknown): Record<string, EnvVarConfig> | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  const result: Record<string, EnvVarConfig> = {};
  for (const [name, envVal] of Object.entries(obj)) {
    const env = asObj(envVal);
    if (env) {
      result[name] = {
        type: asString(env['type']),
        required: env['required'] === true ? true : undefined,
        secret: env['secret'] === true ? true : undefined,
        default: env['default'],
        values: Array.isArray(env['values'])
          ? (env['values'] as unknown[]).map(String)
          : undefined,
      };
    }
  }
  return result;
}

function parseConventions(v: unknown): ConventionsConfig | undefined {
  const obj = asObj(v);
  if (!obj) return undefined;
  return {
    id_format: asString(obj['id_format']),
    timestamps: asString(obj['timestamps']),
    soft_delete: obj['soft_delete'] === true ? true : obj['soft_delete'] === false ? false : undefined,
    json_keys: asString(obj['json_keys']),
    db_columns: asString(obj['db_columns']),
    error_format: obj['error_format'],
  };
}
