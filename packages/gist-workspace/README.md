# @gist-lang/workspace

Shared workspace logic for the [GIST](../../README.md) toolchain. Provides project discovery, kit loading, symbol table construction, and semantic analysis — used by both the CLI and LSP server.

## Features

### Workspace Discovery

Discovers the structure of a GIST project from a root directory:
- Finds `gist.yaml` in the workspace root
- Recursively finds all `.gist` files (skips `node_modules`, `dist`, `.git`, `target`)
- Finds kit directories (`kits/`) in the workspace root and up to 3 parent directories

```typescript
import { discoverWorkspace } from '@gist-lang/workspace';

const workspace = discoverWorkspace('/path/to/project');
// workspace.rootPath       — project root
// workspace.gistYamlPath   — path to gist.yaml (if found)
// workspace.gistFiles      — all .gist file paths
// workspace.kitDirs         — all kit directories with kit.yaml
```

### gist.yaml Parsing

Parses the `gist.yaml` manifest into a fully typed configuration:

```typescript
import { parseGistYaml } from '@gist-lang/workspace';

const config = parseGistYaml('/path/to/gist.yaml');
// config.project, config.runtime, config.framework, config.database,
// config.auth, config.api, config.services, config.testing, config.deploy,
// config.env, config.conventions, config.kitSections
```

### Kit Loading

Loads and parses `kit.yaml` files into typed kit definitions:

```typescript
import { loadKit, loadAllKits, parseKitYaml, KitRegistry } from '@gist-lang/workspace';

// Load a single kit from a directory
const kit = loadKit('/path/to/kits/web');

// Load all kits from discovered directories
const kits = loadAllKits(workspace.kitDirs);

// Register kits into a unified registry
const registry = new KitRegistry();
for (const kit of kits) {
  registry.addKit(kit);
}

// Query the registry
registry.isKitKeyword('page');                 // true
registry.getKitForKeyword('page');             // 'web'
registry.getConstruct('page');                 // KitConstruct { kind, fields, ... }
registry.getAllKeywords();                      // ReadonlySet<string>
registry.getLoadedKitNames();                  // ['web', 'cli', ...]
```

### Symbol Table

Builds a symbol table from a GIST AST with declaration tracking and reference collection:

```typescript
import { SymbolTable } from '@gist-lang/workspace';
import { lex, parse, cstToAst } from '@gist-lang/parser';

const ast = cstToAst(parse(lex(source).tokens).cst);
const symbols = SymbolTable.build(ast, projectConfig);

// Query symbols
symbols.getSymbol('User');          // SymbolInfo { kind, span, ... }
symbols.getAllSymbols();            // all declared symbols
symbols.getRoutes();               // all declared HTTP routes

// Reference tracking
symbols.getReferences('User');     // all reference sites for 'User'
```

**Reference kinds tracked:** `type_ref`, `model_ref`, `spread_ref`, `saves_ref`, `needs_ref`, `uses_ref`, `state_for_ref`, `base_type_ref`

### Semantic Analysis

Runs validation rules on a GIST program and produces diagnostics:

```typescript
import { runAllValidators } from '@gist-lang/workspace';

const diagnostics = runAllValidators(ast, symbols, kitRegistry, declaredKits);
// Returns: Diagnostic[] with errors/warnings for:
// - Duplicate declarations
// - Unknown type references
// - Duplicate routes
// - Purity violations
// - State machine validation
// - Service reference validation
// - Spread validation
// - Kit keyword validation
// - Kit construct field validation
```

## Exports

```typescript
// Types
export type {
  GistProjectConfig, RuntimeConfig, FrameworkConfig, DatabaseConfig,
  CacheConfig, AuthConfig, ApiConfig, ServiceConfig, TestingConfig,
  DeployConfig, EnvVarConfig, ConventionsConfig,
  LoadedKit, KitConstruct, KitConstructField,
  KitYamlSection, KitYamlSectionField,
  WorkspaceInfo,
};

// Workspace discovery
export { discoverWorkspace } from './project-discovery.js';

// YAML parsing
export { parseGistYaml, parseGistYamlContent } from './gist-yaml-parser.js';

// Kit loading
export { loadKit, parseKitYaml, loadAllKits } from './kit-loader.js';

// Kit registry
export { KitRegistry } from './kit-registry.js';

// Analysis
export { SymbolTable } from './analysis/symbol-table.js';
export type { SymbolKind, SymbolInfo, RouteEntry, ReferenceKind, SymbolReference };
export { runAllValidators } from './analysis/validators.js';
```
