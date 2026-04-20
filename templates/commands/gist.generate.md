---
description: Generate production code from GIST specification files
arguments:
  - name: scope
    description: "Optional: specific module or file to generate (default: all)"
    required: false
---

# /gist.generate

Generate a complete, buildable project from the GIST specification.

## Pre-flight

1. Run `gist check` in the project root. **Stop if any errors are reported.** Fix them first.
2. If `gist check --checklist` reports warnings, review them — they indicate underspecified areas that may produce lower-quality output.

## Step 1 — Load context

Read the following files in order:

1. **`gist.yaml`** — project manifest. Extract all sections: `runtime`, `framework`, `database`, `cache`, `events`, `storage`, `auth`, `api`, `services`, `testing`, `deploy`, `env`, `conventions`. These directly control what you generate.
2. **`spec/gist-interpreter.md`** — the full interpreter specification. This is your primary instruction set for code generation. Follow it exactly.
3. **Kit files** — find the `kit:` line in the `.gist` project header. For each declared kit, read:
   - `kits/<name>/kit.yaml` — machine-readable construct definitions
   - `kits/<name>/KIT.md` — human-readable interpretation rules and examples
   - Load kits in declaration order. First-listed kit wins on keyword conflicts.
4. **All `.gist` files** in the project.

## Step 2 — Parse the spec

Process declarations in this order:

1. Project header (`project name` + metadata)
2. Types and traits (`type`, `trait`)
3. Data shapes (`Model = {}`, `Enum = a | b`, `Error = error {}`, `state`)
4. Modules (in dependency order — if module A `needs:` model from module B, process B first)
5. Within each module: `to` intents, `fn` functions, `flow` workflows, `on` event handlers
6. Kit constructs (e.g., `page`, `endpoint`, `command`)
7. Tests (`test "name"`)

## Step 3 — Resolve ambiguity

Apply these resolution rules in priority order:

1. **Explicit beats implicit** — if the spec says it, do exactly that
2. **`eg:` examples are truth** — they override contradicting prose in `do:` blocks
3. **`must:` overrides `do:`** — constraints take precedence over implementation hints
4. **`always:` overrides everything** — project-level and model-level invariants are inviolable
5. **State machines are strict** — no transitions outside the declared graph
6. **Traits spread fields AND `always:` invariants** — both propagate
7. **`fn` is pure** — no side effects, no database access, no I/O
8. **`flow` compensates in reverse** — on failure, run `compensate:` blocks in reverse stage order
9. **`code:` is near-literal** — preserve the algorithm structure
10. **`immutable` means no update/delete ever**
11. **`public` means no auth middleware**

When something is genuinely ambiguous, leave a `// GIST: CLARIFY — <question>` comment and make a reasonable default choice.

## Step 4 — Generate

Produce a complete, buildable project:

### Core output structure
```
src/
  models/          — one file per model (schema, types, validation)
  modules/         — one directory per module (handler, service, types)
  types/           — shared types, enums, error classes
  state-machines/  — transition logic + guards
  hooks/           — before:/after: middleware
  validators/      — must:/ensure: constraint enforcement
  clients/         — service client wrappers (from uses:)
  utils/           — helper functions
migrations/        — database migration files
tests/             — one test file per module + model
package.json       — dependencies matching gist.yaml runtime
.env.example       — from gist.yaml env: section
Dockerfile         — if deploy: section exists
README.md          — project overview from spec
```

### Kit-specific output
Each kit adds its own output directories and files as defined in its `KIT.md`. Generate those alongside the core output.

### Code conventions
Follow `gist.yaml` `conventions:` exactly:
- `id_format` — use the specified ID generation strategy
- `json_keys` — use for API response serialization
- `db_columns` — use for database schema
- `timestamps` — use the specified format
- `soft_delete` — add `deleted_at` field and filter logic if `true`

## Step 5 — Verify completeness

Before finishing, self-check these items:

- [ ] Every model has a corresponding schema/type file
- [ ] Every intent has a handler implementation
- [ ] Every `route:` produces a registered HTTP endpoint
- [ ] Every `saves:` operation has actual persistence logic
- [ ] Every `emits:` event has a publish call
- [ ] Every `must:` constraint has validation code
- [ ] Every `always:` invariant is enforced at the appropriate layer
- [ ] Every `guard:` produces auth/permission middleware
- [ ] Every `state` machine enforces valid transitions only
- [ ] Every `flow` has compensation logic for each stage
- [ ] Every `test` block has a corresponding test case
- [ ] Every `uses:` service has a client wrapper
- [ ] Database migrations match the model schemas
- [ ] Error types from `fails:` are properly thrown and handled
- [ ] `before:`/`after:` hooks are wired into the request pipeline
- [ ] Kit constructs produce their specified output

## Communication protocol

When generating, use `// GIST:` comments to communicate decisions:

- `// GIST: DECISION — <what you chose and why>` — for ambiguous specs
- `// GIST: CLARIFY — <question>` — something the spec should clarify
- `// GIST: WARNING — <issue>` — potential problem in the spec
- `// GIST: GAP — <what's missing>` — spec omission that required assumptions
