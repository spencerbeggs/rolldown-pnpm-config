---
"rolldown-pnpm-config": patch
---

## Bug Fixes

* `upgrade` and `preview` read the registry directly instead of spawning `pnpm view`. Registry routing and auth come from the project `.npmrc` at the workspace root, then the user `~/.npmrc` and `npm_config_*` variables. Scoped registries and per-host tokens keep working. A pnpm version-mismatch notice can no longer break a lookup. A global `<prefix>/etc/npmrc` is no longer read.
* The release-age gate reads `minimumReleaseAge` and `minimumReleaseAgeExclude` from `pnpm_config_*` variables, `pnpm-workspace.yaml` and pnpm's global `config.yaml`, in pnpm's own precedence. It no longer spawns `pnpm config get`.
* Pending changeset bumps are read the way changesets reads them. One malformed changeset file now leaves every workspace package at its current version, where before only that file was skipped.

## Build System

* The package is built with `effected package build`. The published files are unchanged.
