---
description: Cross-artifact consistency check between .gist files, gist.yaml, and kit configs
---

# /gist.analyze

Check that all project artifacts are consistent with each other.

## Steps

### 1. Load all artifacts

Read:
1. `gist.yaml`
2. All `.gist` files
3. Kit files for declared kits (`kits/<name>/kit.yaml` + `kits/<name>/KIT.md`)

### 2. Check gist.yaml vs .gist files

**Services alignment:**
- Every `uses: <service>` in .gist intents should have a matching entry in `gist.yaml` `services:`
- Every service in `gist.yaml` `services:` should be referenced by at least one intent (flag unused services)

**Auth alignment:**
- If `gist.yaml` has `auth:` config, verify that guarded intents exist
- If intents have `guard:` clauses, verify `auth:` is configured

**Database alignment:**
- If models exist, verify `database:` is configured in gist.yaml
- If `database.orm:` is specified, verify it matches the runtime language ecosystem

**Environment variables:**
- Every `base_url_env:` in services should have a corresponding `env:` entry in gist.yaml
- Flag any `env:` entries with `required: true` that have no `default:`

### 3. Check kit consistency

**Kit declarations:**
- Every kit in the `.gist` `kit:` line should have a corresponding directory in `kits/`
- Every kit directory should have both `kit.yaml` and `KIT.md`
- Kit keywords used in `.gist` files should match the declared kit's keyword list

**Kit sections:**
- Kit-defined `yaml_sections:` in `kit.yaml` should have corresponding sections in `gist.yaml` (if the kit expects them)

### 4. Check internal consistency

**Model references:**
- Every `->Model` type reference should point to a declared model
- Every `saves:` target should be a declared model
- Every `needs:` reference should be a declared model or type

**Module dependencies:**
- No circular `needs:` chains
- Modules should be orderable by dependency

**Route uniqueness:**
- No duplicate `method + path` combinations across all modules

### 5. Report

For each finding, report:
- **Category**: `drift`, `missing`, `unused`, `conflict`
- **Severity**: `error` (blocks generation), `warning` (may cause issues), `info` (cleanup opportunity)
- **Recommendation**: how to fix

End with a summary: "X errors, Y warnings, Z info items found."
