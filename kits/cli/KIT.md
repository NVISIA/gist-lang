# GIST Kit: CLI

*Command-line applications with commands, args, flags, and interactive prompts.*

---

## Overview

The CLI kit adds constructs for building command-line tools. The LLM generates framework-specific code (clap/Rust, cobra/Go, Click/Python, Commander/Node, etc.) based on the `runtime:` in `gist.yaml`.

**Activate:** `kit: cli` in your project header.

**Requires `gist.yaml` sections:** `cli` (required), `config` (optional).

---

## Keywords

### `command` — Commands and Subcommands

```gist
command deploy
  > Deploy the application to a target environment.
  alias: "d"

  arg environment: string
    > Target environment name.
    values: ["dev", "staging", "production"]

  flag dry_run: bool
    short: -n
    > Show what would happen without making changes.

  flag force: bool
    short: -f
    > Skip confirmation prompts.

  do:
    validate environment exists
    if not force:
      prompt confirm "Deploy to ${environment}?"
    run deployment pipeline
    output table with deployment status

  must: production deploys require --force or interactive confirmation
```

**`command name`** declares a CLI command. Commands nest for subcommands:

```gist
command config
  > Manage configuration.

  command get
    > Get a config value.
    arg key: string

    do:
      look up key in config file
      output value as plain text

  command set
    > Set a config value.
    arg key: string
    arg value: string

    do:
      validate key exists in schema
      update config file
      output confirmation
```

### `arg` — Positional Arguments

```gist
arg filename: path
  > Input file to process.
  required: true
  validate: file must exist and be readable

arg output: path
  > Output destination.
  default: "./output"
```

**`arg name: type`** declares a positional argument. Order matters — args are consumed left to right.

| Arg type | Meaning |
|----------|---------|
| `string` | Any text |
| `int` | Integer |
| `float` | Number |
| `path` | File or directory path |
| `file` | File path (must exist) |
| `dir` | Directory path (must exist) |
| `url` | URL |

### `flag` — Named Flags

```gist
flag verbose: count
  short: -v
  global: true
  > Increase verbosity. Repeat for more (-vvv).

flag format: string
  short: -f
  default: "table"
  values: ["table", "json", "csv", "plain"]
  > Output format.

flag timeout: int
  default: 30
  env: CLI_TIMEOUT
  > Request timeout in seconds.
```

**`flag name: type`** declares a named flag (`--name` or `-short`). Flags can appear anywhere in the command.

**`env:`** — environment variable fallback. If the flag isn't provided, the value comes from this env var.

**`global: true`** — flag is inherited by all subcommands.

**`count` type** — counts repetitions (`-v` = 1, `-vv` = 2, `-vvv` = 3).

### `prompt` — Interactive Input

```gist
prompt text "Enter project name:" -> project_name
prompt confirm "Delete all files?" -> confirmed
prompt select "Choose a template:" from ["basic", "advanced", "custom"] -> template
prompt password "API key:" -> api_key
prompt multiselect "Select features:" from ["auth", "db", "cache", "search"] -> features
```

**`prompt`** in prose triggers interactive input generation. The LLM generates the appropriate prompt library call (inquire, dialoguer, inquirer, etc.).

### `output` — Structured Output

```gist
output table with columns [name, status, updated_at]
output json result
output progress "Downloading..." with percentage
output spinner "Processing..." while task runs
output plain message
output error "File not found" with exit code 1
```

**`output`** in prose triggers structured output. The LLM generates formatted terminal output.

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Usage error (bad args/flags) |
| `64+` | Application-specific |

---

## Core Construct Usage

### `fn` for Data Formatting

```gist
fn format_size(bytes: int) -> string
  match:
    bytes < 1024 -> "${bytes} B"
    bytes < 1048576 -> "${bytes / 1024} KB"
    bytes < 1073741824 -> "${bytes / 1048576} MB"
    _ -> "${bytes / 1073741824} GB"
```

### `rules` for Defaults

```gist
rules exit_codes:
  success: { code: 0 }
  not_found: { code: 64 }
  permission_denied: { code: 65 }
  network_error: { code: 66 }
```

### `always` for Constraints

```gist
always:
  --verbose and --quiet are mutually exclusive
  all commands support --help and --version
  errors write to stderr, output writes to stdout
```

---

## Grammar Productions

```ebnf
CommandDecl        = 'command' <identifier> INDENT
                     { ContextLine }
                     [ 'alias:' <string_literal> ]
                     [ 'hidden:' ( 'true' | 'false' ) ]
                     { ArgDecl | FlagDecl | CommandDecl }
                     [ DoBlock | CodeBlock ]
                     [ MustBlock ]
                     DEDENT ;

ArgDecl            = 'arg' <identifier> ':' <identifier> INDENT
                     { ContextLine }
                     [ 'required:' ( 'true' | 'false' ) ]
                     [ 'default:' Literal ]
                     [ 'values:' InlineList ]
                     [ 'validate:' <prose> ]
                     DEDENT ;

FlagDecl           = 'flag' <identifier> ':' <identifier> INDENT
                     { ContextLine }
                     [ 'short:' <string_literal> ]
                     [ 'default:' Literal ]
                     [ 'env:' <identifier> ]
                     [ 'values:' InlineList ]
                     [ 'global:' ( 'true' | 'false' ) ]
                     DEDENT ;
```

---

## Interpretation Rules

When `kit: cli` is active, the LLM:

1. Maps `command` to the CLI framework's command/subcommand pattern (clap `Command`, cobra `Command`, Click `@group`/`@command`)
2. Maps `arg` to positional arguments with type parsing and validation
3. Maps `flag` to named options with short aliases, defaults, and env var fallback
4. Generates help text from `> context lines` on commands, args, and flags
5. Generates shell completion scripts when `cli.shell_completions` is true
6. Maps `prompt` to the runtime's interactive prompt library
7. Maps `output` to formatted terminal output (tables, JSON, progress bars)
8. Generates config file loading when `config:` is in `gist.yaml`
9. Generates error handling with appropriate exit codes
10. Produces `--help`, `--version`, and `--no-color` flags automatically

---

## Code Generation Expectations

The LLM produces:

- Main entry point with command routing
- One module per top-level command
- Arg/flag type definitions
- Help text from context lines
- Shell completion scripts (bash, zsh, fish)
- Config file reader (if `config:` section exists)
- Error types with exit codes

---

## Full Example

```gist
project file_manager
  > A CLI tool for managing project files.
  kit: cli
  stack: gist.yaml

  rules formats:
    table: { header: true, borders: true }
    csv: { header: true, delimiter: "," }
    json: { pretty: true }

  always:
    --verbose and --quiet are mutually exclusive
    errors write to stderr with exit code 1

  flag verbose: count
    short: -v
    global: true
    > Increase output verbosity.

  flag quiet: bool
    short: -q
    global: true
    > Suppress all non-error output.

  flag format: string
    short: -f
    default: "table"
    values: ["table", "csv", "json"]
    global: true
    > Output format.


command list
  > List files matching a pattern.
  alias: "ls"

  arg pattern: string
    default: "*"
    > Glob pattern to match.

  flag recursive: bool
    short: -r
    > Search directories recursively.

  flag sort: string
    default: "name"
    values: ["name", "size", "modified"]

  do:
    find files matching pattern
    if recursive: search subdirectories
    sort by flag value
    output table with columns [name, size, modified]


command move
  > Move files to a destination.
  alias: "mv"

  arg source: path
    required: true
  arg destination: path
    required: true

  flag dry_run: bool
    short: -n

  do:
    validate source exists
    validate destination parent exists
    if dry_run:
      output plain "Would move ${source} -> ${destination}"
    else:
      prompt confirm "Move ${source} to ${destination}?"
      move file
      output plain "Moved successfully"


command config
  > Manage tool configuration.

  command get
    arg key: string
    do: look up and output value

  command set
    arg key: string
    arg value: string
    do: validate and update config

  command list
    do: output table of all config values
```

```yaml
# gist.yaml
project: file-manager
version: 0.1.0

runtime:
  language: Rust
  package_manager: cargo

cli:
  name: fm
  binary_name: fm
  description: A fast file management CLI
  shell_completions: true

config:
  format: toml
  path: ~/.config/fm/config.toml
  env_prefix: FM
```

---

*GIST Kit: CLI v1.0.0*
