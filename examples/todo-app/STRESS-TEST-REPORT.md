# GIST Stress Test Report — Todo App

*Testing the GIST v0.7 spec, interpreter instructions, and web kit against a real project.*

---

## Project

A full-stack todo application: React frontend, Java/Spring Boot backend, PostgreSQL database. Uses the `web` kit. Exercises models, traits, enums, state machines, modules, intents, fn, events, rules tables, composition, sharing/permissions, and the web kit's pages/layouts/routing.

## Method

1. Wrote `gist.yaml` and `todo.gist` using only the spec as a guide
2. Fed all spec files + interpreter instructions + the project to a fresh LLM acting as an adversarial reviewer
3. Cataloged every ambiguity, gap, contradiction, and friction point
4. Triaged into fixes vs. acceptable ambiguity

## Findings: 18 issues found, 8 fixed

### Fixed — Example Bugs

| # | Issue | Fix |
|---|-------|-----|
| 1 | Todo model missing `status` field referenced by state machine | Added `status: TodoStatus = open` to Todo model |
| 2 | `completed_at` and `cancelled_at` used in state machine but not declared | Added both as `?: datetime` fields to Todo model |
| 3 | `clear` keyword used but not in spec | Replaced with `set X to null` (valid spec syntax) |
| — | Missing `TodoStatus` enum | Added `TodoStatus = open \| in_progress \| done \| cancelled` |

### Fixed — Spec Gaps

| # | Issue | Fix |
|---|-------|-----|
| 4 | State machine field must exist in model — not stated | Added to §5.9: "The referenced field must exist in the model and its type should be an enum whose values match the declared states." Also clarified initial state. |
| 5 | Rules tables have no runtime access semantics | Added to §4: rules generate static lookup structures accessible at runtime by name |

### Fixed — Web Kit Gaps

| # | Issue | Fix |
|---|-------|-----|
| 6 | `data:` loading semantics undefined (HTTP? SSR? direct call?) | Added "Data Loading & API Bridge" section to web KIT.md — covers same-runtime vs. separate frontend/backend, typed API client generation, loading/error states, `refresh` semantics |
| 7 | Frontend-backend bridge missing | Covered in same section — LLM generates typed API client from backend module definitions when runtimes differ |
| 8 | `auth: required` semantics vague | Added "Auth Guards" section — JWT check, redirect to login, auth context provider, layout inheritance |
| 9 | Slot mapping ambiguous | Added "Slot Mapping" section — `slot content` is default, named slots filled by page render blocks |

### Accepted — Not Fixed

| # | Issue | Why acceptable |
|---|-------|---------------|
| 10 | Computed field materialization not pinned | Intentionally LLM's choice per §5.1 — "The LLM decides the implementation" |
| 11 | Soft delete filtering in web queries | Backend modules enforce this, not the frontend. The `always:` invariant applies at the data layer. |
| 12 | Web kit test blocks undefined | Backend tests use JUnit (from gist.yaml). Frontend e2e uses Playwright (from gist.yaml). The test blocks in the example are backend tests. |
| 13 | Sharing role hierarchy implicit | Prose like "verify user is owner or editor" is clear enough for LLM interpretation. The permission model is in the data shapes. |
| 14 | Email templating unspecified | `uses: email` with "send invitation email" is intentionally prose-level. The LLM generates a reasonable email. |
| 15 | Enum default value semantics | The default is explicit (`= medium`), so this is unambiguous in practice. |
| 16 | `expect after` polling semantics | Low severity. LLMs default to poll + timeout, which is correct. |

## Lessons Learned

1. **State machines need explicit fields.** The biggest "bug" was writing a state machine that referenced a field not in the model. The spec should (and now does) require the field to exist. This is the kind of error that violates "near-determinism" — different LLMs would handle it differently.

2. **Web kit was under-specified for the most common pattern.** The majority of web apps have separate frontends and backends. The kit documented page/component/layout syntax well but didn't explain how data gets from the backend to the frontend. The new "Data Loading & API Bridge" section closes this gap.

3. **Rules tables need runtime semantics.** The spec said rules are "constants" but didn't say they're accessible as data structures. The fn that sorts by `priorities[todo.priority].sort_order` is natural to write but was technically unspecified.

4. **`clear` was a natural word to reach for but doesn't exist in the spec.** Writing `set X to null` works fine. No need to add a keyword — the spec is already expressive enough.

5. **Most "friction" issues are actually fine.** Prose-level ambiguity like "verify user is owner or editor" is exactly what GIST is designed for — the LLM interprets the intent. The spec doesn't need to formalize every permission check.

## Coverage

Features exercised by this example:

- [x] Project header (context, style, rules, always, before/after)
- [x] Tagged types with format constraints
- [x] Traits with spread
- [x] Enums
- [x] Models (standard, ephemeral)
- [x] Computed fields
- [x] State machines (transitions, enter actions, conditional behavior)
- [x] Modules with dependencies
- [x] `to` intents with full metadata (route, guard, saves, emits, uses, public)
- [x] `fn` pure functions (reading rules tables)
- [x] Event handlers (with filters)
- [x] Tests (given/call/then/expect/must fail/as context)
- [x] Web kit: pages, layouts, slots, client_state, data loading, auth guards
- [x] Error types and return unions

Not exercised:

- [ ] `flow` sagas with compensation
- [ ] `code:` pseudocode blocks
- [ ] `immutable` models
- [ ] WebSocket (`socket:`)
- [ ] `schedule:` (cron jobs)
- [ ] `extend` / `refine` composition
- [ ] Multi-file `use` imports
- [ ] `trace` annotation
- [ ] `retain:` data retention
- [ ] `result<T>` partial success
- [ ] Multiple kits loaded simultaneously

---

*Stress test completed against GIST Language Specification v0.7*
