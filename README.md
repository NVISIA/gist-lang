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

## Getting Started

Read the [Getting Started Guide](docs/GIST-getting-started.md) for a 5-minute walkthrough.

## Documentation

| Document | Description |
|----------|-------------|
| [Language Specification](spec/GIST-spec-v0.7.md) | Full language reference (v0.7) |
| [Formal Grammar](spec/GIST-grammar.md) | EBNF grammar for parsers and tooling |
| [gist.yaml Spec](spec/gist-yaml-spec.md) | Infrastructure manifest reference |
| [Interpreter Instructions](spec/GIST-interpreter.md) | System prompt for LLM code generation |
| [Getting Started](docs/GIST-getting-started.md) | Quick start guide |
| [Kit Authoring](docs/GIST-kit-authoring.md) | How to create custom kits |

## Built-in Kits

Kits extend GIST with domain-specific keywords. Each kit is a directory with `kit.yaml` (metadata) and `KIT.md` (interpretation rules).

| Kit | Domain | Key Constructs |
|-----|--------|----------------|
| [iac](kits/iac/) | Infrastructure as Code | `resource`, `group`, `variable`, `output`, `data` |
| [gamedev](kits/gamedev/) | Game Development | `scene`, `entity`, `component`, `system`, `input` |
| [cli](kits/cli/) | Command-Line Apps | `command`, `arg`, `flag`, `prompt`, `output` |
| [mobile](kits/mobile/) | Mobile Apps | `screen`, `nav`, `gesture`, `sheet`, `toast` |
| [web](kits/web/) | Web Frontends | `page`, `component`, `layout`, `slot`, `client_state` |
| [api](kits/api/) | API-First Design | `endpoint`, `version`, `paginate`, `rate_limit`, `middleware` |

## Examples

| Example | Complexity | Stack | Features |
|---------|-----------|-------|----------|
| [bookmarks](examples/bookmarks/) | Simple | TypeScript, Fastify, SQLite | Models, CRUD, tests |
| [todo-app](examples/todo-app/) | Medium | Java, Spring Boot, React | State machines, web kit, sharing, events |
| [deployer](examples/deployer/) | Complex | Rust | Multi-kit (cli + iac), flow sagas, rollback |

## Tooling

The `packages/` directory contains editor tooling for GIST, built as a pnpm monorepo:

| Package | Description |
|---------|-------------|
| [@gist-lang/parser](packages/gist-parser/) | Standalone lexer, parser, and AST for `.gist` files |
| [@gist-lang/lsp](packages/gist-lsp/) | Language Server with diagnostics, completions, hover, and semantic tokens |
| [gist-lang](packages/gist-vscode/) | VS Code extension providing full GIST language support |

## How It Works

1. Write a `gist.yaml` (infrastructure) and `.gist` files (behavior)
2. Feed them to an LLM with the [interpreter instructions](spec/GIST-interpreter.md)
3. The LLM generates a complete, buildable project

GIST is **paradigm-agnostic** — the core spec handles models, types, intents, events, state machines, and testing. Kits add domain-specific constructs. Anyone can [create a kit](docs/GIST-kit-authoring.md).

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
  packages/                      # editor tooling (pnpm monorepo)
    gist-parser/                  # standalone parser library
      src/lexer/                   # tokenizer with INDENT/DEDENT
      src/parser/                  # recursive descent parser → CST
      src/ast/                     # CST → typed AST transformation
    gist-lsp/                     # Language Server Protocol server
      src/workspace/               # project discovery, kit loading
      src/analysis/                # symbol table, semantic validators
      src/features/                # diagnostics, completion, hover, semantic tokens
    gist-vscode/                  # VS Code extension
      src/extension.ts             # LSP client activation
      syntaxes/                    # TextMate grammar
  spec/                          # language specification
    GIST-spec-v0.7.md             # core spec
    GIST-grammar.md               # formal grammar (EBNF)
    gist-yaml-spec.md             # manifest spec
    GIST-interpreter.md           # LLM system prompt
  docs/                          # guides
    GIST-getting-started.md       # quick start
    GIST-kit-authoring.md         # kit creation guide
  kits/                          # built-in domain kits
    api/  cli/  gamedev/  iac/  mobile/  web/
  examples/                      # example projects
    bookmarks/  todo-app/  deployer/
```

## Development

```bash
pnpm install          # install dependencies
pnpm build            # build all packages (parser → lsp → vscode)
pnpm test             # run all 182 tests across 6 test files
```

Requires Node.js 18+ and pnpm.

## License

MIT
