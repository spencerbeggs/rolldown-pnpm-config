---
type: Project
title: rolldown-pnpm-config
description: What this project is, its boundaries, and its non-goals.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: package-json
    resource: package/package.json
  - id: plugin-index
    resource: package/src/plugin/index.ts
  - id: runtime-enforcement
    resource: package/src/runtime/enforcement.ts
---

# rolldown-pnpm-config

## Purpose

`rolldown-pnpm-config` is a library for authoring pnpm config-dependency
plugins — a self-contained `pnpmfile` that pnpm loads and that centrally
manages catalogs plus pnpm settings, merging them into each consuming
repo's pnpm config through the `updateConfig` hook (`package/src/runtime/index.ts:22`).
Config dependencies cannot carry runtime dependencies, so the cardinal
architectural decision is a build-time/runtime split: Effect runs only at
build time (`package/src/plugin/freeze.ts`) to validate and freeze a plugin
author's declared config, and the bundled artifact that ships to consumers
is a tiny, zero-dependency, pure-JS runtime (`package/src/runtime/`). The
managed field surface is defined once in a declarative descriptor table
(`package/src/descriptors/`) — the single source of truth the validation
schemas and the strategy/enforcement registry are derived from.

## Boundaries

The `rolldown-pnpm-config` library lives entirely under `package/`; there is
no source at the repo root. `pnpm-workspace.yaml` names two workspace
patterns — `package` and `examples/*` — and the latter holds three example
consumer workspaces (`rolldown`, `savvy`, `tsdown`) that demonstrate the
plugin under different bundlers rather than owning any part of the library.
Within `package/`, the library owns: the authoring API (`PnpmConfigPlugin({...})`,
`package/src/plugin/index.ts`), the build-time `freeze` step
(`package/src/plugin/freeze.ts`), the descriptor table
(`package/src/descriptors/`), the zero-dependency runtime the pnpmfile ships
(`package/src/runtime/`), and two developer-facing CLI subsystems registered
in `package/src/cli/bin.ts` — `upgrade` (rewrites catalog version ranges in
place) and `export`/`preview` (materializes the plugin config into a
consumer's `pnpm-workspace.yaml` and previews the result). The package also
ships an optional patch-distribution mechanism (`package/src/patches/`) so a
plugin author can distribute pnpm dependency patches through their
config-dependency plugin.

## Non-goals

- **Not Silk-specific.** The library was extracted from the sibling plugin
  `@savvy-web/pnpm-plugin-silk` and generalized so any plugin author can
  declare managed config once and ship it, not just Silk — the runtime's
  public vocabulary carries no "silk" naming (for example
  `Divergence.silkValue`/`childValue` became `managedValue`/`localValue`,
  `package/src/runtime/types.ts:28`).
- **No hard dependency on `@savvy-web/bundler`.** The build step ships as
  `PnpmConfigPlugin`, a standard tsdown/rolldown plugin (`package/src/plugin/index.ts`);
  external consumers on vanilla tsdown can use it directly.
- **The shipped pnpmfile carries no runtime dependencies.** Effect is
  fenced entirely to the build step (`freeze`) and never crosses into the
  bundled artifact; `EnforcementError` is a plain `Error` subclass, not an
  Effect tagged error, specifically because it must survive bundling into a
  dependency-free pnpmfile (`package/src/runtime/enforcement.ts:11`).[^runtime-enforcement]
- **Builds never write.** The build path only reads a plugin author's
  config; rewriting a config file (including workspace-sourced catalog
  entries) is the sole responsibility of the `upgrade` CLI
  (`package/src/cli/commands/upgrade.ts`), never the build plugin.

[^runtime-enforcement]: runtime-enforcement
