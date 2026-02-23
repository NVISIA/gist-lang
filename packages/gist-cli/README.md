# @gist-lang/cli

Command-line interface for [GIST](../../README.md) (Generative Intent Specification Toolkit). Validate, format, scaffold, and manage GIST projects from the terminal.

## Installation

```bash
npm install -g @gist-lang/cli
```

## Commands

### `gist init [name]`

Scaffold a new GIST project.

```bash
gist init my-app
gist init my-app --language typescript --kit api web
gist init my-app --agent claude-code
```

**Options:**
| Flag | Description |
|------|-------------|
| `--language <lang>` | Primary language (e.g., `typescript`, `python`, `rust`) |
| `--kit <kits...>` | Kits to include (e.g., `api`, `web`, `cli`) |
| `--agent <name>` | AI agent to install skills for |

**Creates:**
- `gist.yaml` — project manifest
- `<name>.gist` — starter spec file with commented examples
- Agent skill files (if `--agent` specified)

**Supported agents:** `claude-code`, `cursor`, `copilot`, `windsurf`, `gemini`, `generic`

---

### `gist check [files...]`

Validate `.gist` files for syntax and semantic errors.

```bash
gist check                          # check all .gist files in workspace
gist check app.gist auth.gist      # check specific files
gist check --format json            # JSON output for CI
gist check --checklist              # include spec quality checks
```

**Options:**
| Flag | Description |
|------|-------------|
| `--format <type>` | Output format: `text` (default) or `json` |
| `--checklist` | Also run spec quality checks |

**Validation pipeline:**
1. **Lex** — tokenize with kit keyword support
2. **Parse** — produce syntax tree
3. **AST** — transform to typed AST
4. **Semantic analysis** — build symbol table, run validators

**Checklist checks** (`--checklist`):
- **Completeness** — empty `do:` blocks, orphan models, empty modules
- **Error handling** — missing `fails:` clauses, missing `compensate:` in flows
- **Test coverage** — models and intents without corresponding tests
- **Guard coverage** — public intents without `guard:` declarations
- **Underspecification** — `must:` constraints without `eg:` examples

Exit code 1 on errors.

---

### `gist fmt [files...]`

Format `.gist` files.

```bash
gist fmt                            # print formatted output to stdout
gist fmt --write                    # write formatted files in place
gist fmt --check                    # check if files need formatting (CI)
gist fmt app.gist --write           # format specific file
gist fmt --indent 4                 # use 4-space indentation
```

**Options:**
| Flag | Description |
|------|-------------|
| `--check` | Report files that would change (exit 1 if any) |
| `--write` | Write formatted output back to files |
| `--indent <size>` | Indent width in spaces (default: `2`) |

**Formatting rules:**
- Normalizes indentation to consistent multiples
- Removes trailing whitespace
- Collapses consecutive blank lines (max 1)
- Inserts blank lines between top-level declarations
- Normalizes spacing around `:` `=` `->` `|` `,`
- Preserves prose content in `do:`/`must:` blocks
- Preserves comments unchanged
- Ensures trailing newline

Formatting is idempotent — running twice produces the same output.

---

### `gist kit`

Manage GIST kits (language extensions).

#### `gist kit list`

```bash
gist kit list                       # list all available kits
gist kit list --json                # JSON output
```

Shows all discovered kits with their keywords, constructs, and descriptions.

#### `gist kit install <source>`

```bash
gist kit install web                # install built-in kit by name
gist kit install ./path/to/kit      # install from local path
```

Copies the kit into the project's `kits/` directory. After installing, add `kit: <name>` to your `.gist` project header.

#### `gist kit create <name>`

```bash
gist kit create my-domain           # scaffold in kits/my-domain/
gist kit create my-kit --dir ./custom/path
```

Creates a new kit directory with:
- `kit.yaml` — template with commented examples for keywords, constructs, yaml_sections
- `KIT.md` — interpretation rules template for AI agents

See [Kit Authoring Guide](../../docs/GIST-kit-authoring.md) for full documentation.

#### `gist kit validate [path]`

```bash
gist kit validate kits/my-kit       # validate specific kit
gist kit validate                   # validate all discovered kits
gist kit validate kits/api --json   # JSON output
```

**Checks:**
- kit.yaml exists and is valid YAML
- Required fields (kit name, at least one keyword or construct)
- No conflicts with core GIST keywords (`module`, `trait`, `to`, `fn`, etc.)
- Construct definitions have documentation
- KIT.md exists
- Naming conventions (snake_case keywords, lowercase kit names)

---

### `gist skills`

Manage AI agent slash command skills.

#### `gist skills install --agent <name>`

```bash
gist skills install --agent claude-code
gist skills install --agent cursor
```

Installs GIST workflow slash commands into your AI agent's configuration directory:

| Agent | Directory | Format |
|-------|-----------|--------|
| `claude-code` | `.claude/commands/` | `.md` |
| `cursor` | `.cursor/rules/` | `.mdc` (with frontmatter) |
| `copilot` | `.github/instructions/` | `.md` (with HTML comments) |
| `windsurf` | `.windsurf/rules/` | `.md` |
| `gemini` | `.gemini/commands/` | `.md` |
| `generic` | `.gist/commands/` | `.md` |

**Installed commands:**
| Command | Purpose |
|---------|---------|
| `gist.generate` | Read specs + interpreter rules, generate production code |
| `gist.validate` | Run `gist check --checklist`, explain findings, suggest fixes |
| `gist.plan` | Analyze specs, produce implementation plan |
| `gist.analyze` | Cross-artifact consistency check |
| `gist.checklist` | AI-assisted spec quality review |

#### `gist skills list`

Show installed skills and their target agent.

#### `gist skills agents`

List all supported AI agents.

---

### `gist bundle`

Assemble all project inputs into a single prompt for manual LLM interaction.

```bash
gist bundle                         # output to stdout
gist bundle --output prompt.md      # write to file
gist bundle --no-spec               # exclude interpreter spec
```

**Options:**
| Flag | Description |
|------|-------------|
| `--output <file>` | Write to file instead of stdout |
| `--no-spec` | Exclude the GIST interpreter specification |

Collects: interpreter spec + gist.yaml + kit files + all .gist files into a structured markdown prompt.

---

## Developer Journey

```
1. gist init my-app --agent claude-code    # scaffold project + install AI skills
2. Edit *.gist files                        # write specs (with VS Code LSP support)
3. gist check --checklist                   # validate syntax + spec quality
4. gist fmt --write                         # format specs
5. /gist.generate                           # AI agent generates code
6. Edit specs, re-run                       # iterate
```

## Architecture

```
src/
  bin.ts                    # CLI entry point (commander)
  commands/
    init.ts                  # gist init — project scaffolding
    check.ts                 # gist check — validation pipeline
    fmt.ts                   # gist fmt — code formatting
    kit.ts                   # gist kit — kit management (list, install, create, validate)
    skills.ts                # gist skills — agent skill management
    bundle.ts                # gist bundle — prompt assembly
  agents/
    types.ts                 # AgentConfig, AgentId types
    configs.ts               # Per-agent configurations (directories, transforms)
    registrar.ts             # Install/uninstall/list skills per agent
  kit/
    validator.ts             # Kit validation rules
    scaffolder.ts            # Kit scaffolding templates
  analysis/
    checklist.ts             # Spec quality checks
  bundler/
    prompt-assembler.ts      # Collect and format project inputs
  util/
    reporter.ts              # Terminal diagnostic formatting
```
