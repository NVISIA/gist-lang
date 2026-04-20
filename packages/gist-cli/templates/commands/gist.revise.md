---
description: Ask targeted questions to resolve ambiguities in the GIST spec, then patch the files
---

# /gist.revise

Close the gap between a rough spec and a generation-ready one. This skill asks focused questions about under-specified areas and surgically patches the `.gist` files in response. It does not add new features — use `/gist.gistify` for that. It does not analyze architecture — use `/gist.plan` for that.

## Step 1 — Seed the gap list

Run the static checklist:

```
gist check --checklist --format json
```

Parse the output. Treat each `checklist` item as a candidate gap. Also scan all `.gist` files for these patterns:

- Empty or placeholder `do:` blocks (`do: ...`, `do: TODO`, single-line do with a vague verb).
- Intents with mutations but no `fails:` clause.
- Intents on a `route:` without a `guard:` (for non-public endpoints).
- Models with bare `string` fields where a narrower type fits (`email`, `url`, `phone`, `slug`).
- Required fields marked optional (or vice versa) based on the `do:` prose.
- Missing `eg:` examples on non-trivial intents.
- Vague verbs in `do:` prose: "handle", "process", "manage", "deal with" — these are generation-unfriendly.

## Step 2 — Prioritize

Rank gaps in this order:

1. **Blockers** — anything that would cause `gist check` to fail or produce incorrect code (missing `fails:` on intents that clearly can fail, unguarded mutations on a JWT project).
2. **Quality** — vague `do:` blocks, missing `eg:`.
3. **Polish** — tightening field types, richer `must:` constraints.

## Step 3 — Ask

Present up to **5** questions in a single batch. Keep each question:

- Tied to a specific file:line location.
- Answerable in one or two sentences.
- Framed with a concrete suggestion the user can accept or override.

Example format:

> **1.** `bookmarks.gist:42` — `to delete(id)` has no `fails:` clause. Suggest `fails: NotFound when bookmark does not exist`. Accept, or something different?
>
> **2.** `bookmarks.gist:18` — `url: string` could be narrowed to `url: url`. Accept?

Wait for the user's answers before editing. If more than 5 gaps exist, note that another pass will follow.

## Step 4 — Patch surgically

For each accepted answer, make the **minimum** edit:

- Add or tighten a single clause (`fails:`, `guard:`, `must:`, `eg:`) at the correct indentation.
- Narrow a field type by changing only that field's line.
- Replace a vague verb with a concrete one in the existing `do:` line — do not rewrite surrounding steps.
- Never reformat unrelated lines. Never move declarations. Never touch `project <name>`, `stack:`, or kit declarations.

If the user rejects a suggestion or offers a different answer, use their version verbatim (clean it up to match GIST syntax).

## Step 5 — Re-check and loop

Run `gist check --checklist` again. Report:

- Gaps closed in this pass.
- Gaps remaining.
- Whether another round would help.

If the user wants another pass, return to Step 1. Otherwise finish.

## Output

Summarize:
- Number of gaps closed and remaining
- Final `gist check` result
- Suggested next step: another `/gist.revise` pass, `/gist.plan` for architecture review, or `/gist.generate` to produce code
