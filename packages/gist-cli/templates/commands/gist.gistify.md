---
description: Bootstrap or augment a GIST project from a natural-language description
arguments:
  - name: prompt
    description: "Natural-language description of the project. If omitted, reads .gist/intent.md"
    required: false
---

# /gist.gistify

Turn a natural-language description into a populated `gist.yaml` and a starter `.gist` file — or merge new features into an existing project.

## Step 1 — Resolve the prompt

Get the project description in this priority order:

1. If `$ARGUMENTS` is non-empty, use it as the prompt.
2. Otherwise, read `.gist/intent.md`. Strip the markdown header (`# Intent`) and any "Staged …" timestamp line; use the remaining body.
3. Otherwise, ask the user: *"Describe the project you want to build (what it does, key features, who uses it)."*

Keep the raw prompt available for later steps — you will reference it when inferring kits, models, and intents.

## Step 2 — Detect project state

Inspect the working directory:

- **Bootstrap mode** — if `gist.yaml` is missing OR contains only `project: <name>` (no other populated sections) AND every `.gist` file has no models or `module` declarations.
- **Populated mode** — if `gist.yaml` has any of `runtime`, `framework`, `database`, `auth`, `api`, `services`, `conventions`, etc., OR any `.gist` file contains models or modules.

If populated mode is detected, **ask the user explicitly** before writing anything:

> "This project already has a spec. Do you want to (a) replace it entirely, (b) augment it with new features from the prompt, or (c) abort?"

Do not proceed until the user answers. Honor the choice.

## Step 3 — Load context

Read, in order:

1. `gist.yaml` (if present) — note existing sections you must preserve in augment mode.
2. All existing `.gist` files — note existing models, modules, and `kit:` declarations.
3. The GIST spec at `spec/gist-spec-v0.7.md` (if present in the repo) — ground truth for syntax.
4. For any kit you intend to declare, load `kits/<name>/kit.yaml` and `kits/<name>/KIT.md` so every construct you write is valid under that kit.

## Step 4 — Infer the stack from prose

Map common prompt phrases to GIST artifacts. Examples — do not treat as exhaustive; use judgment:

| Prompt signal | Implies |
|---|---|
| "REST API", "endpoints", "CRUD" | `kit: api`, `framework: fastify` (TS) or `fastapi` (Py), `api.style: REST` |
| "web app", "pages", "SSR" | `kit: web` |
| "CLI tool", "command-line" | `kit: cli` |
| "mobile app", "iOS/Android" | `kit: mobile` |
| "tagged", "search", "filter" | Model relationships + `to list(...)` intent with filters |
| "auth", "users", "login" | `auth.strategy: JWT`, `User` model, `guard:` on mutations |
| "save", "persist", "storage" | `database:` block, `saves:` on intents |
| "notifications", "emit events" | `events:` block, `emits:` on intents |

Pick the **smallest** set of sections that the prompt justifies. Do not invent sections the user did not imply.

## Step 5 — Generate `gist.yaml`

**Bootstrap mode:** write a fresh file. Include only sections grounded by the prompt, in this order:

```yaml
project: <name>
version: 0.1.0
description: <one-line summary from the prompt>

runtime:
  language: <inferred>
  platform: <inferred>

framework:
  name: <inferred>

database:        # only if persistence is implied
  type: <inferred>
  orm: <inferred>

auth:            # only if auth is implied
  strategy: <inferred>

api:             # only if HTTP surface is implied
  style: REST
  prefix: /api

testing:
  framework: <inferred>

conventions:
  id_format: cuid
  timestamps: ISO-8601-UTC
  json_keys: camelCase
  db_columns: snake_case
```

**Augment mode:** read the existing file; add only sections that are missing. Never overwrite a populated section without asking.

## Step 6 — Generate the starter `.gist` file

Target path: `<project>.gist` in the project root (match the `project` name). In augment mode, edit the existing file in place.

**Bootstrap mode template:**

```gist
project <name>
  > <one-line description from the prompt>
  stack: gist.yaml
  kit: <kits>

  always:
    // 1-3 project-wide invariants inferred from the prompt

// Models (1-3 seed models grounded in the prompt)
<Model> = {
  id: string, generated, cuid
  // fields inferred from prompt
  created_at: datetime, generated
}

// Module with 2-4 intents showing core happy paths
module <name>
  > <short module description>

  to <verb>(<args>) -> <Return> | <Error>
    route: <METHOD> /<path>
    saves: <Model>
    do:
      // concrete steps inferred from the prompt
    eg: <verb>(...) => { ... }
```

**Augment mode rules:**
- Never modify the existing `project <name>` line, `stack:`, `always:`, or existing models/intents.
- Append new models after existing ones (leave a blank line between).
- Append new modules below existing modules.
- Merge the `kit:` line by union (alphabetize the result).

**GIST syntax reminders:**
- Indentation: 2 spaces. No tabs.
- Keywords lowercase (`to`, `fn`, `module`, `do`, `route`, `saves`, `must`, `fails`, `eg`).
- Model/enum/error names PascalCase. Field names snake_case.
- Every `to` intent with a mutation should declare a return type union including an error (`-> Bookmark | ValidationFailed`).
- Prefer specific field types (`email`, `url`) over bare `string` where the prompt supports it.

## Step 7 — Verify

1. Run `gist check` in the project root. Report any errors inline — do not leave a broken spec.
2. If there are warnings, summarize them and recommend `/gist.revise` to address them interactively.

## Step 8 — Clean up

If you successfully read from `.gist/intent.md`, delete that file. The intent has been consumed.

## Output

Report a short summary:

- Files written (bootstrap) or modified (augment)
- Kits declared
- Models and modules created
- Result of `gist check` (pass / N warnings / N errors)
- Suggested next step: `/gist.constitution` to refine principles, `/gist.revise` to clarify gaps, or `/gist.generate` to produce code
