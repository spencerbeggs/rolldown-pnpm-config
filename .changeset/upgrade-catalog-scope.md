---
"rolldown-pnpm-config": patch
---

## Bug Fixes

`upgrade --catalog <name>` now scopes every mode, not just the interactive table. Before, `--check`, `--yes`, `--dry-run` and `--preview` ignored the flag and went through every catalog in the config.

* `--check` reports drift only for the named catalog, and its exit code depends only on that drift
* `--yes` writes only the named catalog's entries
* The `--format json` documents (`drift`, `changed`, `skipped`) only contain rows for the named catalog
* A `--catalog` that names no declared catalog now fails in every mode, listing the declared catalogs, instead of silently matching nothing. Under `--format json` it reports `error.kind: "catalog"`
