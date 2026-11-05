---
"rolldown-pnpm-config": patch
---

## Bug Fixes

- `export` and `upgrade` now write atomically, through a temp file and a rename, so a crash mid-write can no longer leave a truncated `pnpm-workspace.yaml` or config file. Symlinks and file modes are kept. The directory must now be writable as well as the file, and a read-only target is refused.
- `overridesFromCatalogs` and `allowedVersionsFromCatalogs` now skip a version that is not valid semver, such as `01.2.3`, instead of emitting a rule for it. `overridesFromCatalogs` also skips a range with trailing whitespace.

## Refactoring

- Remove the `export` scalar-splice workaround now that `@effected/yaml` keeps a scalar's quotes and comment when style options are passed. Output is unchanged.
