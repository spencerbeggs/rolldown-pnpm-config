---
type: Runbook
title: Recover from a stale config-dependency lockfile
description: Force pnpm to pick up a `configDependencies` version bump when it keeps loading the old plugin.
resource: ../../pnpm-lock.yaml
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: pnpm-lock
    resource: ../../pnpm-lock.yaml
  - id: pnpm-workspace
    resource: ../../pnpm-workspace.yaml
tags:
  - release
---

# Recover from a stale config-dependency lockfile

This procedure is not written down anywhere else in the repository; it is
captured here for the first time.

## Trigger

A `configDependencies` entry's version was bumped in
`pnpm-workspace.yaml` (currently `@effected/pnpm-plugin-effect` and
`@savvy-web/pnpm-plugin-silk`), but pnpm keeps loading the old plugin
version — `pnpm install`, even with `--force`, reports the workspace as
already up to date and does not resolve the new
version.[^pnpm-workspace][^pnpm-lock]

## Cause

`pnpm-lock.yaml` in this repo is two concatenated YAML documents: the
first (currently lines 1–24, terminated by a bare `---`) records only
`configDependencies` — resolved before pnpmfile hooks, since config
dependencies supply those hooks — and the second is the ordinary
lockfile.[^pnpm-lock] pnpm ignores a `configDependencies` bump in
`pnpm-workspace.yaml` while that first document still records the old
version/integrity; nothing in the normal install path re-syncs it.

## Symptom / the tell

A stack trace that mixes two different versions of the same package in
one traceback — e.g. two different `effect@…` store paths appearing
together — is the diagnostic signature that the config-dependency
resolution and the rest of the dependency graph have drifted out of sync
with each other.

## Recovery

1. Open `pnpm-lock.yaml` and find the **first** YAML document only (before
   the first bare `---` line) — do not touch the second document.
2. Hand-edit the stale `configDependencies` entry there (its `specifier`,
   `version`, and the corresponding `packages`/`snapshots` block's
   integrity and version) so it matches the version now declared in
   `pnpm-workspace.yaml`'s `configDependencies`.[^pnpm-workspace][^pnpm-lock]
3. Run `rm -rf node_modules/.pnpm-config`.
4. Reinstall (`pnpm install`).

## Success

The loaded plugin reports the expected (bumped) version, and a
mixed-version stack trace no longer appears.

[^pnpm-lock]: pnpm-lock
[^pnpm-workspace]: pnpm-workspace
