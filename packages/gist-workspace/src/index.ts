// Types
export type {
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
  LoadedKit,
  KitConstruct,
  KitConstructField,
  KitYamlSection,
  KitYamlSectionField,
  WorkspaceInfo,
} from './types.js';

// Workspace discovery
export { discoverWorkspace } from './project-discovery.js';

// YAML parsing
export { parseGistYaml, parseGistYamlContent } from './gist-yaml-parser.js';

// Kit loading
export {
  loadKit,
  parseKitYaml,
  loadAllKits,
  topoSortKits,
  resolveKitDependencies,
  detectKitDependencyIssues,
} from './kit-loader.js';

// Kit registry
export { KitRegistry } from './kit-registry.js';

// Analysis
export { SymbolTable } from './analysis/symbol-table.js';
export type { SymbolKind, SymbolInfo, RouteEntry, ReferenceKind, SymbolReference } from './analysis/symbol-table.js';
export { runAllValidators } from './analysis/validators.js';
export { buildImportGraph, resolveAlias, isExposed, updateFileInGraph, removeFileFromGraph } from './analysis/import-resolver.js';
export type { ImportGraph, ResolvedImport, FileEntry, FileLoader } from './analysis/import-resolver.js';
export { ProjectSymbolTable } from './analysis/project-symbol-table.js';
export type { ResolvedSymbol, ResolvableDecl, ExtensionRef } from './analysis/project-symbol-table.js';
