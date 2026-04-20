---
description: Define or refine project-level principles and conventions in existing GIST constructs
arguments:
  - name: prompt
    description: "Natural-language principles (e.g. 'timestamps UTC, soft-delete, JWT auth'). Optional."
    required: false
---

# /gist.constitution

Capture the project's governing principles — the invariants that every generated artifact must honor. This skill writes into GIST's **native constructs** (`always:` in the project header, `conventions:` in `gist.yaml`). It does not create a separate constitution file.

## Step 1 — Resolve the prompt

1. If `$ARGUMENTS` is non-empty, use it.
2. Otherwise, read `.gist/intent.md` if present.
3. Otherwise, ask the user: *"What principles should govern this project? Think about code quality, testing, security, and data hygiene."*

## Step 2 — Elicit or confirm principles

Cover these four buckets. For each, either extract an answer from the prompt or ask the user one concise question:

1. **Code quality** — naming conventions, case style, module size discipline.
2. **Testing standards** — framework, minimum coverage, required scenarios (happy path, failure, auth).
3. **Security / auth invariants** — mutation guards, rate limits, secret handling, session rules.
4. **Data hygiene** — id format, timestamp format, soft-delete policy, nullability discipline.

Keep it terse — the user should not feel interrogated. 2–6 short questions total.

## Step 3 — Map principles to constructs

Route each principle to the right place:

### Universal invariants → `always:` in the project header (`.gist` file)

Things that must be true of the **running system**, not just the code style. Examples:

```gist
project <name>
  stack: gist.yaml
  kit: ...

  always:
    timestamps are UTC
    mutations require an authenticated user
    soft-delete: records are marked, never erased
    rate-limit mutation endpoints to 60/min/user
```

### Code style / data conventions → `conventions:` in `gist.yaml`

Things about the shape of the code and persistence format:

```yaml
conventions:
  id_format: cuid          # or uuid | nanoid
  timestamps: ISO-8601-UTC # or Unix
  json_keys: camelCase
  db_columns: snake_case
  soft_delete: true
```

### Testing norms → `testing:` section in `gist.yaml`

```yaml
testing:
  framework: Vitest        # or Jest | Pytest | …
```

Plus a short comment in the project header's `> ` description if testing discipline is a defining principle (e.g., "TDD: failing test before implementation").

## Step 4 — Write changes

- **Preserve** existing `always:` entries. Append new ones; only replace an existing line if the user explicitly confirmed.
- **Preserve** every populated key in `gist.yaml`. Only add keys that are currently missing, unless the user explicitly asked to change a value.
- Use GIST's exact indentation (2 spaces) and lowercase keyword conventions.
- Keep `always:` entries short and declarative — one line each, imperative or stative mood.

## Step 5 — Verify

1. Run `gist check`. The result must still pass (or only emit advisory warnings).
2. If any semantic error appears, fix the construct you just wrote — do not leave the spec broken.

## Step 6 — Clean up

If you read from `.gist/intent.md`, do not delete it — `gist.constitution` consumes principles, but an intent file may still be used by `/gist.gistify`. Leave `.gist/intent.md` alone unless you are certain it is now redundant.

## Output

Summarize:
- `always:` entries added/updated (count)
- `conventions:` keys added/updated (list)
- Result of `gist check`
- Suggested next step: `/gist.gistify` if the spec is still empty, `/gist.revise` to tighten underspecified intents, or `/gist.generate` to produce code
