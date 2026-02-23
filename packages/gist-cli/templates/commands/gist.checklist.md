---
description: AI-assisted spec quality review with actionable suggestions
---

# /gist.checklist

Review the GIST specification for quality and completeness, providing AI-assisted suggestions that go beyond what `gist check --checklist` can detect statically.

## Steps

### 1. Run the static checklist

Run `gist check --checklist --format json` and parse the output. This gives you the baseline static analysis.

### 2. Deep review

Go beyond static checks. For each module, review:

**Intent quality**
- Are `do:` blocks specific enough to generate unambiguous code?
- Do step descriptions use clear verbs (validate, fetch, compute, save) vs vague ones (handle, process, manage)?
- Are edge cases covered?

**Data model quality**
- Are field types specific enough? (`string` vs `email`, `url`, `phone`)
- Are required vs optional fields correctly marked?
- Do models that represent database rows have appropriate constraints?

**Error handling quality**
- Are `fails:` clauses comprehensive? (What happens on not found, unauthorized, validation failure, service unavailable?)
- Are error types specific enough to produce meaningful API error responses?

**Test quality**
- Do tests cover the happy path AND failure cases?
- Do tests use `must fail` for error scenarios?
- Are `given:` preconditions realistic?

**Security review**
- Are mutation endpoints properly guarded?
- Is the auth strategy appropriate for the use case?
- Are there intents that accept user input without `must:` validation constraints?

### 3. Produce the report

Structure the output as a checklist grouped by quality dimension:

```
## Spec Quality Report

### Completeness (X/Y pass)
- [x] All intents have do: blocks
- [ ] Missing: auth.logout has no do: block

### Error Handling (X/Y pass)
- [ ] Missing: bookmarks.create has no fails: clause
  Suggestion: add `fails: ValidationFailed, Unauthorized`

### Test Coverage (X/Y pass)
- [ ] Missing: no tests for bookmarks.delete
  Suggestion: add test "delete nonexistent bookmark" with must fail

### Security (X/Y pass)
- [x] All mutation endpoints are guarded
- [ ] Warning: bookmarks.list is public with no rate limiting

### Clarity (AI-assessed)
- [ ] bookmarks.create do: block says "validate input" — specify which fields
  Suggestion: "validate url is valid URL, validate title is non-empty"
```

### 4. Suggest fixes

For each failing item, provide the exact GIST syntax to add or modify. Make suggestions copy-paste ready.
