# GIST Roadmap

Features that are planned or deferred. When you land a planned item, remove it
from this file and update the spec/docs.

## Language surface

- [ ] Cross-file references in `needs:` / `saves:` / `emits:` module metadata
- [ ] Traits spreading models (today: trait→trait only)
- [ ] Transitive spread flattening (`Admin` → `User` → `Auditable` → all fields)
- [ ] Transitive `exposing` (re-exports through an alias chain)
- [ ] Dedicated `extend Model` keyword for behavior-level model modification

## Composition

- [ ] `pass to <dotted_name>(…)` — described in the spec grammar (§19) but not accepted by the parser yet
- [ ] `extend` / `refine` bodies merged into the target intent's semantic model (today: surfaced in hover and validators, but not merged into `doBlock`; the LLM interpreter sees them as separate prose)
- [ ] Completion for `extend` / `refine` target names (local + qualified)

## LSP

- [ ] Find-references on an import alias token itself (`shared` in `shared.User`)
- [ ] File watcher for `gist.yaml` and `kits/**` (`.gist` files are watched; other config changes require restart)
- [ ] Workspace symbol search including cross-file qualified refs
- [ ] `exposing` name-casing warnings (e.g. `exposing user` for PascalCase `User`)

## Docs

- [ ] Dedicated "Cross-file imports" guide in `docs/` — currently only covered in the spec

## Performance

- [ ] Cache `isExportedFromSibling` results; invalidate on file graph change
