# GIST

**Generative Intent Specification Toolkit** — a language for thinking out loud to machines.

GIST is a semi-structured language for specifying software that any large language model can interpret into working code, infrastructure, or both. It sits between natural language prompts (too ambiguous) and traditional source code (too detailed). You write the gist. The LLM writes the implementation.

```gist
project bookmarks
  > Personal bookmark manager. Save URLs, tag them, search later.
  stack: gist.yaml

  always:
    URLs must be valid (http or https)

Tag = { id: string, generated, cuid; name: string, unique }

Bookmark = {
  id: string, generated, cuid
  url: string
  title: string
  tags: -> Tag[]
  created_at: datetime, generated
}

module bookmarks

  to create(url: string, title: string, tags?: string[]) -> Bookmark | ValidationFailed
    route: POST /bookmarks
    saves: Bookmark, Tag
    do: validate URL, create or find tags, create bookmark
    must: url starts with "http://" or "https://"

  to list(tag?: string, q?: string) -> Bookmark[]
    route: GET /bookmarks
    public
    do: filter by tag or search query, order by created_at desc

test create_and_find
  call bookmarks.create("https://example.com", "Example", tags: ["ref"])
  expect: returns Bookmark with 1 tag
```

Feed this to an LLM with the spec and interpreter instructions, and it generates a complete Fastify/Express/Axum/Spring Boot project with routes, models, migrations, tests, and a Dockerfile.

---

## Quick Start

> **Prerequisites:** Node.js ≥ 18 and [pnpm](https://pnpm.io/) (this repo pins `pnpm@10.30.1` via `packageManager`).

```bash
# Clone the monorepo and install dependencies
git clone https://ebtechnet.com/public-access/gist-lang.git
cd gist-lang
pnpm install

# Build the CLI (and the workspace packages it depends on)
pnpm build

# Link the CLI onto your PATH as `gist`
pnpm --filter @gist-lang/cli link --global

# Scaffold a new project with AI agent integration
gist init my-app --language typescript --agent claude-code

# Or: bootstrap directly from a natural-language description
gist init my-app --agent claude-code --prompt "a bookmark manager with tags and search"
# Then run /gist.gistify in your agent to populate gist.yaml + .gist files

# Write your specs, then validate
gist check

# Format your .gist files
gist fmt --write

# Generate code via your AI agent's slash command
# /gist.generate
```

To update later, pull and rebuild:

```bash
cd gist-lang && git pull && pnpm install && pnpm build
```

Read the [Getting Started Guide](docs/gist-getting-started.md) for a full walkthrough.

---

## CLI

The `gist` CLI is the primary interface for working with GIST projects.

| Command | Description |
|---------|-------------|
| `gist init [name]` | Scaffold a new project (gist.yaml + starter .gist file). Use `--prompt "..."` to stage a natural-language description for `/gist.gistify`. |
| `gist gistify [prompt...]` | Stage a natural-language prompt for `/gist.gistify` to consume. Supports `--file` and `--stdin`. |
| `gist check [files...]` | Validate .gist files for syntax and semantic errors |
| `gist fmt [files...]` | Format .gist files (normalize indentation, spacing, blank lines) |
| `gist kit list` | List available and installed kits |
| `gist kit install <name>` | Install a kit into the project |
| `gist kit create <name>` | Scaffold a new custom kit |
| `gist kit validate [path]` | Validate a kit.yaml for correctness |
| `gist skills install` | Install AI agent slash commands |
| `gist skills list` | Show installed skills |
| `gist bundle` | Assemble all project inputs into a single prompt |

See the [CLI Reference](packages/gist-cli/README.md) for full documentation.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Language Specification](spec/gist-spec-v0.7.md) | Full language reference (v0.7) |
| [Formal Grammar](spec/gist-grammar.md) | EBNF grammar for parsers and tooling |
| [gist.yaml Spec](spec/gist-yaml-spec.md) | Infrastructure manifest reference |
| [Interpreter Instructions](spec/gist-interpreter.md) | System prompt for LLM code generation |
| [Getting Started](docs/gist-getting-started.md) | Quick start guide |
| [Kit Authoring](docs/gist-kit-authoring.md) | How to create custom kits |
| [CLI Reference](packages/gist-cli/README.md) | Full CLI command documentation |

## Built-in Kits

Kits extend GIST with domain-specific keywords. Each kit is a directory with `kit.yaml` (metadata) and `KIT.md` (interpretation rules).

| Kit | Domain | Key Constructs |
|-----|--------|----------------|
| [web](kits/web/) | Web Frontends | `page`, `component`, `layout`, `slot`, `client_state` |
| [api](kits/api/) | API-First Design | `endpoint`, `version`, `paginate`, `rate_limit`, `middleware` |
| [cli](kits/cli/) | Command-Line Apps | `command`, `arg`, `flag`, `prompt`, `output` |
| [mobile](kits/mobile/) | Mobile Apps | `screen`, `nav`, `gesture`, `sheet`, `toast` |
| [iac](kits/iac/) | Infrastructure as Code | `resource`, `group`, `variable`, `output`, `data` |
| [gamedev](kits/gamedev/) | Game Development | `scene`, `entity`, `component`, `system`, `input` |

Manage kits with the CLI: `gist kit list`, `gist kit install <name>`, `gist kit create <name>`.

## Examples

| Example | Complexity | Stack | Features |
|---------|-----------|-------|----------|
| [bookmarks](examples/bookmarks/) | Simple | TypeScript, Fastify, SQLite | Models, CRUD, tests |
| [todo-app](examples/todo-app/) | Medium | Java, Spring Boot, React | State machines, web kit, sharing, events |
| [deployer](examples/deployer/) | Complex | Rust | Multi-kit (cli + iac), flow sagas, rollback |

## Tooling

The `packages/` directory contains the GIST toolchain, built as a pnpm monorepo:

| Package | Description |
|---------|-------------|
| [@gist-lang/cli](packages/gist-cli/) | CLI for validating, formatting, scaffolding, and managing GIST projects |
| [@gist-lang/parser](packages/gist-parser/) | Standalone lexer, parser, and AST for `.gist` files |
| [@gist-lang/workspace](packages/gist-workspace/) | Workspace discovery, kit loading, symbol table, and semantic analysis |
| [@gist-lang/formatter](packages/gist-formatter/) | Code formatter for `.gist` files |
| [@gist-lang/lsp](packages/gist-lsp/) | Language Server with diagnostics, completions, hover, go-to-definition, rename, and more |
| [gist-lang](packages/gist-vscode/) | VS Code extension providing full GIST language support |

## How It Works

1. **Bootstrap** (optional) — describe the project in prose with `gist init --prompt "..."` and run `/gist.gistify` to produce the initial `gist.yaml` + `.gist` files
2. **Refine** — capture principles with `/gist.constitution`, close gaps with `/gist.revise`
3. **Write / edit** the `gist.yaml` (infrastructure) and `.gist` files (behavior) directly
4. **Validate** with `gist check --checklist` (syntax + spec quality)
5. **Generate** via AI agent slash commands (`/gist.generate`) or `gist bundle` for manual LLM prompting

GIST is **paradigm-agnostic** — the core spec handles models, types, intents, events, state machines, and testing. Kits add domain-specific constructs. Anyone can [create a kit](docs/gist-kit-authoring.md).

### AI Agent Integration

GIST integrates with AI coding agents through **slash command skills**:

```bash
gist skills install --agent claude-code   # or cursor, copilot, windsurf, gemini
```

This installs markdown instruction files that teach your AI agent the GIST workflow:

| Slash Command | Purpose |
|---------------|---------|
| `/gist.gistify` | Bootstrap or augment a project from a natural-language description (populates gist.yaml + starter `.gist`) |
| `/gist.constitution` | Capture project principles as `always:` invariants and `conventions:` in gist.yaml |
| `/gist.revise` | Ask targeted questions to close gaps in the spec and patch files in place |
| `/gist.generate` | Parse specs, generate production code following the GIST interpreter pipeline |
| `/gist.validate` | Run spec quality checks and suggest improvements |
| `/gist.plan` | Analyze specs and produce an implementation plan |
| `/gist.analyze` | Cross-artifact consistency check |
| `/gist.checklist` | AI-assisted spec quality review |

## Core Beliefs

1. **Intent over implementation.** Say what, not how.
2. **Structure where it disambiguates.** Formal syntax for scope and data flow. Prose for everything else.
3. **Near-determinism.** Same program, different LLMs, functionally equivalent output.
4. **Composability.** Build big things from named small things.
5. **Verifiability.** Every behavior can carry constraints, examples, and tests.
6. **Joy.** If it's tedious to write, the syntax is wrong.

## Project Structure

```
gist-lang/
  packages/                      # toolchain (pnpm monorepo)
    gist-cli/                     # CLI tool
      src/commands/                # init, check, fmt, kit, skills, bundle
      src/agents/                  # agent skill registrar (6 agents)
      src/kit/                     # kit validator and scaffolder
      src/analysis/                # spec quality checklists
      src/bundler/                 # prompt assembler
    gist-parser/                  # standalone parser library
      src/lexer/                   # tokenizer with INDENT/DEDENT
      src/parser/                  # recursive descent parser → CST
      src/ast/                     # CST → typed AST transformation
    gist-workspace/               # shared workspace logic
      src/analysis/                # symbol table, semantic validators
    gist-formatter/               # code formatter
    gist-lsp/                     # Language Server Protocol server
      src/features/                # diagnostics, completion, hover, definition,
                                   # references, rename, code-actions, formatting
    gist-vscode/                  # VS Code extension
      syntaxes/                    # TextMate grammar
  spec/                          # language specification
    gist-spec-v0.7.md             # core spec
    gist-grammar.md               # formal grammar (EBNF)
    gist-yaml-spec.md             # manifest spec
    gist-interpreter.md           # LLM system prompt
  docs/                          # guides
    gist-getting-started.md       # quick start
    gist-kit-authoring.md         # kit creation guide
  templates/commands/             # slash command templates for AI agents
  kits/                          # built-in domain kits
    api/  cli/  gamedev/  iac/  mobile/  web/
  examples/                      # example projects
    bookmarks/  todo-app/  deployer/
```

## Development

```bash
pnpm install          # install dependencies
pnpm build            # build all packages (parser -> workspace -> formatter -> lsp + cli)
pnpm test             # run all tests
```

Requires Node.js 18+ and pnpm.

## License

MIT
