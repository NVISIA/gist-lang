# @gist-lang/lsp

Language Server Protocol (LSP) implementation for the [GIST language](../../README.md). Provides real-time diagnostics, context-aware completions, hover documentation, go-to-definition, find-references, rename, code actions, document formatting, and semantic token highlighting for `.gist` files.

## Features

### Diagnostics

**Parse-level** (from `@gist-lang/parser`):
- Lexer errors (unexpected characters, unclosed strings)
- Parser errors (unexpected tokens, missing required syntax)

**Semantic-level:**
- Duplicate name declarations (models, enums, types, modules)
- Unknown type references in type positions
- Duplicate HTTP routes (same method + path)
- Purity violations in `fn` blocks (saves/emits/route/socket not allowed)
- State machine validation (model existence, field existence, hook state references)
- `uses:` referencing services not declared in `gist.yaml`
- Spread validation (`...TraitName` references)
- Kit keyword used without `kit:` declaration in project header
- Kit construct missing required fields

### Completions

Context-aware suggestions across 16 completion contexts:
- **Top level**: `project`, `module`, `type`, `trait`, `state`, `test`, `use`, `extend`, kit keywords
- **Project header**: `kit:`, `stack:`, `style:`, `rules`, `always:`
- **Module body**: `to`, `fn`, `flow`, `on`, `needs:`
- **Intent body**: `route:`, `guard:`, `saves:`, `emits:`, `uses:`, `do:`, `must:`, `public`, `async`
- **Type positions**: primitives (`string`, `int`, `bool`, ...) + declared models/enums/types/traits + `result<T>`, `map<K,V>`
- **`uses:` position**: services from `gist.yaml`
- **`kit:` position**: loaded kit names
- **Kit construct body**: fields with value choices from `kit.yaml`

All keyword completions include snippet insertion with tab stops.

### Hover

Rich documentation on hover for:
- **Models**: fields (with trait spread resolution), modifiers, spreads
- **Enums**: values
- **Modules**: context description, intents, functions, flows
- **Intents/fns**: full signature (params + return type), route, saves, emits, guard
- **Kit keywords**: doc, fields, children (from `kit.yaml`)
- **Services**: type, URL (from `gist.yaml`)
- **State machines**: transitions, target model
- **Traits**: fields
- **Errors**: fields
- **Type aliases**: base type
- **Constants**: value

### Go to Definition

Ctrl+click (or F12) on a type name, model, enum, trait, error, or type alias to jump to its declaration.

### Find References

Right-click > Find All References on any declaration to see everywhere it's used — in field types, return types, parameters, `saves:`, `needs:`, `uses:`, spreads, and state machine `for:` clauses.

### Rename

Rename a model, enum, trait, type alias, or error and update all references across the document. The server validates naming conventions (PascalCase for types, snake_case for identifiers) before applying.

### Code Actions (Quick Fixes)

- **Undeclared type** → "Create model X", "Create enum X", "Create error X"
- **Undeclared trait** → "Create trait X"

Quick fixes insert a scaffolded declaration at the end of the document.

### Workspace Symbols

Open the symbol picker (Ctrl+T / Cmd+T) to search all declarations across the workspace — models, enums, traits, modules, intents, state machines, and more. Symbols are displayed with module-qualified names (e.g., `auth.login`).

### Document Formatting

Format on save or manual format (Shift+Alt+F) using the `@gist-lang/formatter`. Normalizes indentation, spacing around operators, blank lines, and trailing whitespace.

### Semantic Tokens

Supplements the static TextMate grammar with dynamic highlighting:
- Kit keywords as `macro` (unknown to static grammar)
- HTTP methods (`GET`, `POST`, etc.) as `method`
- Field modifiers (`generated`, `unique`, `public`, etc.) as `modifier`
- Function/intent names after `to`/`fn`/`flow` as `function`
- Type names as `type`

## Architecture

```
src/
  server.ts                    # LSP entry point, capability registration, request handlers
  index.ts                     # Entry point (imports server.ts)
  features/
    diagnostics.ts             # Bridge AST -> SymbolTable -> validators -> LSP diagnostics
    completion.ts              # Context-aware autocomplete
    hover.ts                   # Hover documentation
    semantic-tokens.ts         # Dynamic semantic token highlighting
    definition.ts              # Go-to-definition
    references.ts              # Find-all-references
    rename.ts                  # Rename symbol (prepare + compute edits)
    code-actions.ts            # Quick fixes for undeclared types/traits
    workspace-symbols.ts       # Workspace symbol search
```

The LSP depends on shared packages:
- `@gist-lang/parser` — tokenization, parsing, AST
- `@gist-lang/workspace` — project discovery, kit loading, symbol table, semantic analysis
- `@gist-lang/formatter` — document formatting

### Parse Pipeline

On every document change, the server runs the full pipeline:

1. **Lex** — tokenize source with kit keywords from the registry
2. **Parse** — produce CST from tokens
3. **AST** — transform CST to typed AST
4. **Semantic analysis** — build symbol table (with reference tracking), run validators, produce diagnostics
5. **Cache** — store AST and symbol table for completion/hover/definition/references requests

### Workspace Discovery

On initialization, the server:
1. Discovers `gist.yaml`, all `.gist` files, and `kits/` directories
2. Parses `gist.yaml` into a typed project configuration
3. Loads all `kit.yaml` files into a `KitRegistry`
4. Passes kit keywords to the lexer for dynamic keyword recognition

## Integration

This package is designed to be used via an editor client. See [`gist-vscode`](../gist-vscode/) for a reference VS Code integration.

The server communicates over the LSP protocol and registers these capabilities:
- `textDocumentSync: Full`
- `completionProvider` (trigger characters: `:`, `.`, ` `)
- `hoverProvider`
- `semanticTokensProvider` (full document)
- `definitionProvider`
- `referencesProvider`
- `renameProvider` (with prepare support)
- `codeActionProvider` (quick fixes)
- `workspaceSymbolProvider`
- `documentFormattingProvider`
