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

Add `upgrade --check`: a pure drift gate that resolves exactly as `--yes`
would, never writes, and exits `0` when every catalog entry is in sync or
`1` when anything would have been rewritten — for release validation
pipelines. Each drift row is annotated with the entry's version source
(`(workspace)` or `(registry)`), and a resolution failure is labeled
distinctly from drift. Builds never write: the CLI owns all source
rewriting.

Add `upgrade --json` for the non-interactive modes (`--check`, `--yes`,
`--dry-run`): stdout carries exactly one single-line JSON document —
`{"command":"check","inSync":...,"drift":[...]}` or
`{"command":"upgrade","applied":...,"changed":[...]}` with
`{catalog, pkg, from, to?, source}` rows — and all human-facing text moves
to stderr, so bash consumers (a GitHub Action) can capture stdout and feed
it straight to `jq`. A resolution failure still emits a document with the
non-zero exit; combining `--json` with the interactive path or `--preview`
fails fast.

## Bug Fixes

Fix `normalizeCatalogs` so it no longer throws when the catalogs map
contains non-declaration siblings alongside catalog packages.

Fix workspace package enumeration to follow the `packages:` globs declared
in the workspace's own `pnpm-workspace.yaml` (via `@effected/workspaces`),
including exclusion patterns, instead of a hardcoded `packages/*` walk —
repos using `libs/*` or nested layouts previously got silently wrong or
empty enumeration for workspace-sourced entries.
