---
type: Module
title: Runtime
description: The zero-dependency pnpmfile runtime — createHooks, the strategy table, and enforcement.
resource: ../../package/src/runtime
kind: package
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: runtime-index
    resource: package/src/runtime/index.ts
  - id: runtime-types
    resource: package/src/runtime/types.ts
  - id: runtime-enforcement
    resource: package/src/runtime/enforcement.ts
  - id: runtime-ctx
    resource: package/src/runtime/ctx.ts
  - id: strategies-table
    resource: package/src/runtime/strategies/table.ts
---

# Runtime

## Boundary

`createHooks(base, manifest, name)` (`@public`, `package/src/runtime/index.ts:22`)
returns `{ updateConfig }` — the whole surface pnpm's pnpmfile loader
calls.[^runtime-index] It is bundled with zero external dependencies:
`EnforcementError` is deliberately a plain `Error` subclass rather than an
Effect tagged error so it survives bundling (`package/src/runtime/enforcement.ts:11`).[^runtime-enforcement]
`createHooks` takes a required third `name: string` parameter and tags
every warning box `[<name>]` on its first line. This module receives only
the plain-data `{ base, manifest, name }` contract the
[plugin-engine](plugin-engine.md) emits — it never runs Effect and never
reads source config directly.

## What crosses the boundary

At install time, `updateConfig(config)` (`package/src/runtime/index.ts:24`)
builds the strategy table from `manifest`, resolves the per-install `ctx`
once, then for each manifest field: runs its named strategy against
`base[field]` and the local config's value, applies any data-driven refine
(for example `excludeByRepo` on `publicHoistPattern`, resolved via
`resolveRootName`, both in `package/src/runtime/ctx.ts:12,39`),[^runtime-ctx]
applies enforcement, and accumulates divergences for the two warning boxes
— all before returning the merged config to pnpm. `Enforcement`
(`"absent" | "warn" | "error"`, `package/src/runtime/types.ts:71`) and
`Divergence` (`package/src/runtime/types.ts:28`, carrying `kind: "override"
| "security"`, `managedValue`, `localValue`) are the stable contract every
strategy and the enforcement step share.[^runtime-types]

## What lives inside

A strategy is a pure `(base, local, ctx) => { merged, divergences }` —
strategies only *detect* divergences and classify each by `kind`; they
never decide the response. Strategies live under `strategies/` (`arrays.ts`,
`maps.ts`, `overrides.ts`, `scalar.ts`, `catalogs.ts`), grouped by kind and
keyed by name in `strategies/table.ts`; the manifest references a strategy
by name, so the build emits no strategy code — the runtime owns every
implementation.[^strategies-table] The response — routing `warn`
divergences to the override or security console box by `kind`, throwing
`EnforcementError` on `error`, staying silent on `absent` — lives in
`applyEnforcement` (`package/src/runtime/enforcement.ts:25,33`).[^runtime-enforcement]
There is deliberately no catch-and-fall-back-to-local guard: an
`error`-enforced divergence must propagate and fail the install — the
rationale is recorded inline at the top of `package/src/runtime/index.ts:14`.[^runtime-index]
`package/src/runtime/warnings.ts` formats the two `name`-tagged warning
boxes.

See [detection-separated-from-response](../decisions/detection-separated-from-response.md)
and [effect-at-build-time-only](../decisions/effect-at-build-time-only.md).

[^runtime-index]: runtime-index
[^runtime-types]: runtime-types
[^runtime-enforcement]: runtime-enforcement
[^runtime-ctx]: runtime-ctx
[^strategies-table]: strategies-table
