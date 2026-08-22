---
"rolldown-pnpm-config": minor
---

## Features

Add workspace-sourced catalog entries. Catalog packages can now declare
`source: "workspace"` to resolve their version from the local next release
(package manifests plus pending changesets) instead of the registry.
Workspace-sourced entries are exempt from the `upgrade` command's
release-age gate and take their sole resolved candidate automatically on
every non-interactive path (`--yes`, `--preview`, `--check`, and the CI
table fallback).

The plugin build now converges workspace-sourced catalog drift into the
config source in a single build, and notifies consumers of what changed
via a new `PluginConfig.onCatalogUpdate` callback along with the exported
`CatalogChange`/`CatalogChanges` types.

Add `upgrade --check`: a pure drift gate that resolves exactly as `--yes`
would, never writes, and exits `0` when every catalog entry is in sync or
`1` when anything would have been rewritten — for release validation
pipelines.

## Bug Fixes

Fix `normalizeCatalogs` so it no longer throws when the catalogs map
contains non-declaration siblings alongside catalog packages.
