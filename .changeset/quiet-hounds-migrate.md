---
"rolldown-pnpm-config": minor
---

## Features

* Migrated the runtime dependency stack from Effect v3 to Effect v4 (`effect` and `@effect/platform-node` now resolve via `catalog:effect`). The entire v3 satellite closure — `@effect/cli`, `@effect/cluster`, `@effect/experimental`, `@effect/platform`, `@effect/printer`, `@effect/printer-ansi`, `@effect/rpc`, `@effect/sql`, `@effect/typeclass`, `@effect/workflow` — is no longer part of the published dependency tree, since v4 folds that functionality into `effect` itself and `@effect/platform-node` v4 peers only on `effect`. Consumers get a substantially smaller dependency tree on install.
* Replaced `yaml` with `@effected/yaml` and `semver-effect` with `@effected/semver` — drop-in replacements for the surface this package uses.

## Refactoring

* CLI command parsing was ported from the now-unmaintained `@effect/cli` to `effect/unstable/cli`, and process spawning moved to `effect/unstable/process`. Commands, flags, and output are unchanged — this is an internal migration only.

## Bug Fixes

* Fixed an `ae-wrong-input-file-type` API Extractor diagnostic by making `virtual.d.ts` self-contained — the `PnpmHooks`/`PnpmConfig` shape is now inlined instead of imported from the package's own runtime types, which previously pulled a raw `.ts` file into the declaration-file analysis pass
