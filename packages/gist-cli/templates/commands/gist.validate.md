---
description: Validate GIST spec files and review quality issues
arguments:
  - name: files
    description: "Optional: specific .gist files to validate (default: all)"
    required: false
---

# /gist.validate

Run validation on the GIST specification and review the results.

## Steps

1. Run `gist check --checklist` in the project root.
2. Review the output. There are two sections:
   - **Diagnostics** — syntax and semantic errors/warnings (file:line:col format)
   - **Checklist** — spec quality issues (completeness, test coverage, error handling, etc.)

3. For each **error**, explain:
   - What the error means
   - How to fix it
   - Show the corrected GIST syntax

4. For each **warning**, explain:
   - Whether it matters for this project
   - The recommended fix (if applicable)

5. For each **checklist item**, assess:
   - Is this a real gap or acceptable for the current project stage?
   - If it's a real gap, suggest the GIST syntax to add

## Example output

```
bookmarks.gist:28:19 warning Undeclared type 'ValidationFailed'
```

**Fix:** Add an error declaration for `ValidationFailed`:
```gist
ValidationFailed = error {
  message: string
  field: string
}
```

## Priority

Fix errors first (they block generation), then address warnings, then review checklist items. Not all checklist items need fixing — use judgment about what's relevant for the project.
