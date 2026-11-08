---
"rolldown-pnpm-config": patch
---

## Bug Fixes

* The release-age gate reads `minimumReleaseAge` and `minimumReleaseAgeExclude` from `pnpm_config_*` variables, `pnpm-workspace.yaml` and pnpm's global `config.yaml`, in pnpm's own precedence. It no longer spawns `pnpm config get`. Registry lookups still go through `pnpm view`, so `.npmrc` registries, tokens, proxies and CA settings apply as before.
* Pending changeset bumps are read the way changesets reads them. One malformed changeset file now leaves every workspace package at its current version, where before only that file was skipped.

## Build System

* The package is built with `effected package build`. The published files are unchanged.
