# GIST Language — VS Code Extension

VS Code extension providing language support for [GIST](../../README.md) (`.gist`) files. Connects to the [`@gist-lang/lsp`](../gist-lsp/) server for rich editor features.

## Features

- **Syntax highlighting** — TextMate grammar for keywords, types, strings, comments, modifiers, HTTP methods, and context lines
- **Diagnostics** — real-time parse and semantic errors/warnings
- **Autocomplete** — context-aware completions with snippet insertion across 16 contexts
- **Hover** — documentation for models, modules, intents, kit constructs, services, and more
- **Go to Definition** — Ctrl+click on type names to jump to declarations
- **Find References** — see all usages of a model, enum, trait, or type alias
- **Rename** — rename a declaration and update all references
- **Code Actions** — quick fixes for undeclared types ("Create model X")
- **Document Formatting** — format on save with consistent indentation and spacing
- **Workspace Symbols** — Ctrl+T to search all declarations across files
- **Semantic tokens** — dynamic highlighting for kit keywords and function declarations
- **File watching** — automatic re-validation on changes to `.gist`, `gist.yaml`, and `kit.yaml` files

## Development

### Prerequisites

- Node.js 18+
- pnpm

### Build

From the monorepo root:

```bash
pnpm install
pnpm build            # builds all packages (parser -> workspace -> formatter -> lsp -> vscode)
```

Or build just this extension:

```bash
pnpm --filter gist-lang build
```

### Run in VS Code

1. Open the monorepo root in VS Code
2. Press **F5** to launch the Extension Development Host
3. Open a folder containing `.gist` files (e.g., `examples/bookmarks/`)

### Run Tests

```bash
pnpm test             # runs all tests across the monorepo
```

## Architecture

```
src/
  extension.ts                  # Activate/deactivate LSP client
syntaxes/
  gist.tmLanguage.json          # TextMate grammar (static highlighting)
language-configuration.json     # Brackets, comments, indentation rules
package.json                    # Extension manifest (language registration, grammar)
```

The extension itself is thin — it activates the `@gist-lang/lsp` server over IPC and registers the `.gist` language with VS Code. All intelligence (diagnostics, completions, hover, definition, references, rename, code actions, formatting, workspace symbols, semantic tokens) comes from the LSP server.

### TextMate Scopes

| Scope | Elements |
|-------|----------|
| `keyword.control.gist` | `project`, `module`, `kit:`, `stack:`, `state`, `for`, `test`, `use`, `extend`, `refine` |
| `keyword.declaration.gist` | `to`, `fn`, `flow`, `on` |
| `keyword.constraint.gist` | `always:`, `must:`, `ensure:`, `across` |
| `entity.name.type.gist` | PascalCase identifiers |
| `storage.modifier.gist` | `generated`, `unique`, `secret`, `computed`, `ephemeral`, `immutable` |
| `keyword.operator.http.gist` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `support.type.primitive.gist` | `string`, `int`, `float`, `bool`, `date`, `datetime`, `bytes`, `any`, `void` |
| `comment.context.gist` | `> ...` context lines |
| `comment.line.double-slash.gist` | `// ...` line comments |
| `string.quoted.double.gist` | `"double-quoted strings"` |
| `constant.numeric.gist` | Integer, float, and duration literals |
