/** Typed representation of a gist.yaml project configuration. */
export interface GistProjectConfig {
  project: string;
  version?: string;
  description?: string;
  runtime?: RuntimeConfig;
  framework?: FrameworkConfig;
  database?: DatabaseConfig;
  cache?: CacheConfig;
  auth?: AuthConfig;
  api?: ApiConfig;
  services?: Record<string, ServiceConfig>;
  testing?: TestingConfig;
  deploy?: DeployConfig;
  env?: Record<string, EnvVarConfig>;
  conventions?: ConventionsConfig;
  /** Kit-specific YAML sections (e.g., cli:, iac:, web:) */
  kitSections: Record<string, unknown>;
}

export interface RuntimeConfig {
  language?: string;
  platform?: string;
  version?: string;
  package_manager?: string;
}

export interface FrameworkConfig {
  name?: string;
  version?: string;
}

export interface DatabaseConfig {
  type?: string;
  version?: string;
  orm?: string;
  migrations?: string;
  connection?: { env?: string };
}

export interface CacheConfig {
  type?: string;
  connection?: { env?: string };
}

export interface AuthConfig {
  strategy?: string;
  token_expiry?: string;
  refresh_token?: boolean;
  password_hashing?: string;
}

export interface ApiConfig {
  style?: string;
  prefix?: string;
  docs?: string;
  cors?: { origins?: string[] };
}

export interface ServiceConfig {
  type?: string;
  base_url?: string;
  base_url_env?: string;
  auth?: { type?: string; key_env?: string };
}

export interface TestingConfig {
  framework?: string;
  coverage?: boolean;
}

export interface DeployConfig {
  target?: string;
  compose?: boolean;
}

export interface EnvVarConfig {
  type?: string;
  required?: boolean;
  secret?: boolean;
  default?: unknown;
  values?: string[];
}

export interface ConventionsConfig {
  id_format?: string;
  timestamps?: string;
  soft_delete?: boolean;
  json_keys?: string;
  db_columns?: string;
  error_format?: unknown;
}

/** Typed representation of a kit.yaml definition. */
export interface LoadedKit {
  name: string;
  version: string;
  author?: string;
  description?: string;
  license?: string;
  keywords: string[];
  constructs: Map<string, KitConstruct>;
  yamlSections: Record<string, KitYamlSection>;
  extends: string[];
  extendsKits: string[];
}

export interface KitConstruct {
  kind: 'declaration' | 'inline' | 'block';
  nameStyle: 'identifier' | 'PascalCase' | 'none';
  doc: string;
  fields: Record<string, KitConstructField>;
  children?: string[];
  supports?: string[];
  snippet?: string;
}

export interface KitConstructField {
  type?: string;
  doc?: string;
  required?: boolean;
  default?: unknown;
  values?: string[];
  completions?: string[];
}

export interface KitYamlSection {
  description?: string;
  fields: Record<string, KitYamlSectionField>;
}

export interface KitYamlSectionField {
  type?: string;
  required?: boolean;
  default?: unknown;
  values?: string[];
  fields?: Record<string, KitYamlSectionField>;
}

/** Workspace discovery result. */
export interface WorkspaceInfo {
  rootPath: string;
  gistYamlPath?: string;
  gistFiles: string[];
  kitDirs: string[];
}
