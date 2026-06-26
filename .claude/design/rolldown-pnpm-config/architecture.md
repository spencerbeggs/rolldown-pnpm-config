---
status: current
module: rolldown-pnpm-config
category: architecture
created: 2026-06-25
updated: 2026-06-26
last-synced: 2026-06-26
completeness: 92
related:
  - settings-coverage.md
  - specs/2026-06-26-pnpm-settings-coverage-design.md
dependencies: []
---

# rolldown-pnpm-config - architecture

A library for authoring pnpm config-dependency plugins, where Effect runs only at build time and the shipped pnpmfile carries a zero-dependency runtime.

## Table of contents

1. [Overview](#overview)
2. [Current state](#current-state)
3. [Rationale](#rationale)
4. [System architecture](#system-architecture)
5. [Data flow](#data-flow)
6. [Integration points](#integration-points)
7. [Roadmap](#roadmap)
8. [Related documentation](#related-documentation)

## Overview

`rolldown-pnpm-config` is a publishable library for authoring pnpm config-dependency plugins — a self-contained `pnpmfile` that pnpm loads and that centrally manages catalogs plus pnpm settings, merging them into each consuming repo's pnpm config through the `updateConfig` hook.

It was extracted from the one working plugin `@savvy-web/pnpm-plugin-silk` and generalized so any plugin author can declare managed config once and ship it, not just Silk.

The cardinal architectural decision is the build-time / runtime split. Config dependencies cannot carry runtime dependencies — everything must bundle into the shipped pnpmfile — so Effect is confined entirely to the build step and the bundled artifact is a tiny pure-JS runtime. This keeps consumer installs light and is the constraint that shapes every other boundary below.

The managed field surface is defined once in a declarative descriptor table (`package/src/descriptors/`) — the single source of truth from which the validation schemas and the strategy/enforcement registry are derived. See the [settings coverage matrix](settings-coverage.md) for the full enumerated field set.

Reference this document when changing the engine contract, the descriptor table, the build-to-runtime emit pipeline or the public authoring surface.

## Current state

Phase 1 (the engine) shipped via PR #3 and Phase 3 (full field coverage) has since landed on `feat/complete-schema`. The authoring API, the strategy engine and the build-to-runtime emit pipeline are implemented, the managed field surface now spans the full workspace-appropriate pnpm setting set (121 fields, up from Silk's 14), and the original 14 stay proven Silk-equivalent by differential parity. The package is intentionally still `private` (pre-publish).

The pipeline has three stages, each on one side of the build / runtime boundary.

Authoring API (`@public`, build time): authors call `definePlugin` to declare catalogs plus the managed pnpm fields, and `defineCatalogs` to normalize named catalog declarations. The `PluginConfig` shape is a hand-authored interface (one `FieldInput<T>` per field, for rich per-field JSDoc and DX), kept in lockstep with the descriptor table by the compile-time drift guard described below. See `package/src/define-plugin.ts` and `package/src/define-catalogs.ts`.

Build step (`freeze`, the only place Effect runs, `@internal`): `freeze` validates each declared field against its descriptor-derived Schema and emits two plain-data structures — `base` (field to frozen value) and `manifest` (field to `{ strategy, enforcement, options? }`). Invalid config surfaces as a typed `ConfigError`. The schema map (`FIELD_SCHEMAS`) is derived from `DESCRIPTORS`; `catalogs` remains special-cased (its value is `config.catalogs.catalogs`). See `package/src/plugin/freeze.ts`.

Runtime (`createHooks`, zero-dependency, `@public`): `createHooks(base, manifest)` returns `{ updateConfig }`. It builds the strategy table, runs each field's strategy, applies the field's enforcement, prints the warning boxes and returns the merged config. See `package/src/runtime/index.ts`.

### Load-bearing field shapes

`FieldInput<T>` is either a bare `T` or `{ value, enforcement }`, letting an author override the default enforcement per field. `publicHoistPattern` additionally accepts `{ value, excludeByRepo }`. Both live in `package/src/define-plugin.ts`.

`Enforcement` is `absent | warn | error` and a `Divergence` carries `kind: "override" | "security"`. Both are defined in `package/src/runtime/types.ts` and are the stable contract every strategy and the enforcement step share.

### Public API boundary

The build-time authoring surface plus the runtime entry are `@public`; everything else — the strategies, the descriptor table, the derived field registry, `freeze`, `ConfigError`, the warning-box formatters and the ctx helpers — is `@internal`. The exact `@public` set is the export list of `package/src/index.ts` and the runtime types in `package/src/runtime/types.ts`; treat changes to either as API-surface changes.

## Rationale

### Effect at build time only

The user's framing was "compile Effect away". Statically erasing Effect's fiber runtime from arbitrary programs is infeasible, so instead Effect is fenced to `freeze` and never crosses into the bundle. The bundled output contains zero Effect, verified because the runtime imports nothing external.

This is why `EnforcementError` is a plain `Error` subclass rather than an Effect tagged error — it must survive bundling into a dependency-free pnpmfile. See `package/src/runtime/enforcement.ts`.

### Detection separated from response

A strategy is a pure `(base, local, ctx) => { merged, divergences }`. Strategies only *detect* divergences and classify each by `kind`; they never decide what to do about one. The response lives in `applyEnforcement`, which routes `warn` divergences to the override or security console boxes by kind and throws `EnforcementError` on `error`, while `absent` is silent. This split lets the same strategy serve every enforcement level. See `package/src/runtime/enforcement.ts`.

The runtime deliberately has no catch-and-fall-back-to-local guard: an `error`-enforced divergence must propagate and fail the install. If a swallow-guard is ever added it must rethrow `EnforcementError` rather than fall back. The rationale is recorded inline at the top of `package/src/runtime/index.ts`.

### Descriptor table as the single source of truth

Each managed pnpm field is one entry in a declarative descriptor table under `package/src/descriptors/`, carrying its validation `schema`, `kind`, merge `strategy`, default `enforcement`, doc string and optional refine `options`. The table is split across category modules (resolution, hoisting, lockfile, build, runtime-cfg, workspace, misc, network) merged with `satisfies` into one `DESCRIPTORS` object in `package/src/descriptors/index.ts`. The `satisfies` (never a `: FieldDescriptors` annotation) is load-bearing: it preserves each entry's narrow schema type so the drift guard can read per-field value types. See `package/src/descriptors/types.ts` for the `FieldDescriptor<A>` shape.

What code consumes is **derived** from the table, not hand-listed: `deriveSchemas(DESCRIPTORS)` produces `FIELD_SCHEMAS` (consumed by `freeze`) and `deriveRegistry(DESCRIPTORS)` produces `FIELD_REGISTRY` (`package/src/registry.ts` is now three lines). Adding a field is a single descriptor entry plus its matching `PluginConfig` line — the schema, registry and table-driven tests all follow from it.

The hand-authored `PluginConfig` interface is kept honest by a value-level drift guard at `package/__test__/types/plugin-config.test-d.ts`: a compile-time assertion that each authored field's type and its descriptor-derived type are mutually assignable, so widening an authored field (e.g. `string` against a `Schema.Literal(...)` union) or dropping one breaks `typecheck`. Two keys are key-checked only — `catalogs` (authored as `CatalogsResult`) and `publicHoistPattern` (carries the `excludeByRepo` refine the schema does not model). Every descriptor is also exercised by the table-driven suite at `package/__test__/descriptors/table.test.ts` (strategy exists in `STRATEGY_TABLE`; schema accepts/rejects samples).

The 14 original Silk fields were migrated into the table **parity-locked** — strategy and enforcement preserved verbatim — and the parity suite still proves byte-identical `{ base, manifest }` output, so the descriptor refactor changed no behavior. The strategy table itself was untouched: this is purely a front-of-pipeline (authoring → freeze) change.

Strategies are grouped by kind under `package/src/runtime/strategies/` and keyed by name in `package/src/runtime/strategies/table.ts`; the manifest references a strategy by that name, so the build emits no strategy code — the runtime owns the implementations. The descriptor table reuses the existing strategies; no new merge engine was added for the expanded field set.

### Data-driven refines, not injected code

Some Silk behavior depends on which repo consumes the plugin and so cannot be a static strategy — chiefly its `WORKSPACE_LOCAL_HOISTS_BY_REPO` hoist exclusion. This is modeled as a data-driven `excludeByRepo` refine on `publicHoistPattern`: `resolveRootName` resolves the consuming repo and `excludeByRepo` drops the assigned packages from the merged hoist list. See `package/src/runtime/ctx.ts`. Arbitrary code-injected refines were deliberately not built — refines are data-driven only, which keeps the manifest plain serializable data.

### Standard plugin, no bundler coupling

The build step ships as `PnpmConfigPlugin`, a standard tsdown/rolldown plugin, so the library never hard-depends on `@savvy-web/bundler`. External consumers on vanilla tsdown can use the plugin directly; the Savvy bundler's plugin passthrough is an ergonomics convenience, not a requirement. This preserves the broad-public-library goal. See `package/src/plugin/index.ts`.

## System architecture

`PnpmConfigPlugin(config)` is constructed with a `definePlugin` result and serves two virtual modules. The Effect `freeze` runs once and is memoized on the plugin closure, because the bundler invokes the plugin across several passes and the validate-freeze-manifest work must not repeat. See `package/src/plugin/index.ts`.

The pnpmfile virtual module is `import { createHooks }` plus deterministically key-sorted `base` and `manifest` literals; the catalogs virtual module is a standalone sorted `Map` literal for programmatic catalog reads. Both are produced by `package/src/plugin/serialize.ts`, whose recursive `sortKeys` keeps emitted artifacts diff-stable.

At install time `createHooks` builds the strategy table from the manifest, resolves the per-install `ctx` once, then for each manifest field runs its strategy, applies any data-driven refine to the merged value, applies enforcement, and accumulates divergences for the two warning boxes before returning the merged config.

## Data flow

Build time: `definePlugin` config flows into `freeze`, which validates per field and emits `{ base, manifest }`; `PnpmConfigPlugin` serializes that into the two virtual modules the bundler emits as the pnpmfile and the catalogs module.

Install time: pnpm calls `updateConfig(localConfig)`; for each field the runtime merges `base[field]` with `localConfig[field]` via the named strategy, refines and enforces the result, and writes it into the merged config only when it carries content. The merged config crosses back to pnpm; divergence warnings go to the console.

The boundary that must stay stable is the `{ base, manifest }` contract — it is the only thing crossing from build time into the bundled runtime, and both sides are typed by `Base` and `Manifest` in `package/src/runtime/types.ts`.

## Integration points

Consumers integrate by adding `PnpmConfigPlugin(definePlugin(...))` to a tsdown/rolldown build and re-exporting the two virtual specifiers (`rolldown-pnpm-config/virtual/pnpmfile` and `.../virtual/catalogs`); the specifier strings are defined in `package/src/plugin/index.ts`.

The Silk parity proof is the integration that Phase 1 rests on. `package/__test__/parity/` transcribes Silk's full managed config as `silk.config.ts` and asserts the engine's merged output deep-equals Silk's own published pnpmfile across a battery of consumer-config inputs — differential testing against the real artifact rather than a hand-maintained golden file.

The parity suite is local-only. The oracle loaders read Silk's built artifacts from a sibling repo (path overridable via `SILK_DIST`), guard with `existsSync` and return `null` when absent, so the oracle-dependent suites skip cleanly in CI and run fully locally. See `package/__test__/parity/oracle.ts`.

Three divergences from Silk are accepted and proven parity-neutral — each affects only warning text or robustness, never merged output: the security warning's `detail` string is field-agnostic rather than per-field; `excludeByRepo` runs after the merge (exclude-wins) instead of Silk's filter-before-merge, verified identical for Silk's real data; and the override box has a `Math.max(0, …)` width guard making it strictly more robust than Silk.

## Roadmap

Phase 1 (complete, shipped): the authoring API, the strategy engine and the build-to-runtime emit pipeline, scoped to the fields Silk uses and proven Silk-equivalent.

Phase 3 (complete, on `feat/complete-schema`): the managed field surface grew from Silk's 14 to the full workspace-appropriate pnpm setting set (121 fields) via the descriptor table, reusing the existing strategies with no runtime-engine change. Field-by-field coverage and the classification of excluded keys live in [settings-coverage.md](settings-coverage.md). The descriptor-table design is recorded in [the coverage design spec](specs/2026-06-26-pnpm-settings-coverage-design.md). This is part of the current state.

Phase 2 (next, not built): a CLI version resolver that queries the registry and resolves latest compatible versions honoring peer constraints, rewriting the `defineCatalogs` source. The bin scaffold exists at `package/src/cli/`. Check the `effect-catalog-resolver` skill first — it may already cover much of the registry-query and peer-constraint logic.

Pre-publish hardening (cross-cutting, before any release): ship library-owned ambient virtual-module types for external consumers, add real publish metadata and drop `private`, and widen peer ranges. The package is currently `private` and intentionally pre-publish.

## Related documentation

- [settings-coverage.md](settings-coverage.md) — the full enumerated 121-field coverage matrix (key, kind, strategy, enforcement, anchor) and the excluded-key classification.
- [the coverage design spec](specs/2026-06-26-pnpm-settings-coverage-design.md) — the rationale for the descriptor-table-as-single-source-of-truth design.
- `package/src/descriptors/` — the descriptor table (single source of truth) and the `deriveSchemas`/`deriveRegistry` helpers.
- `package/src/define-plugin.ts` and `package/src/define-catalogs.ts` — the authoring API and the hand-authored `PluginConfig`.
- `package/src/registry.ts` and `package/src/runtime/strategies/table.ts` — the derived field-to-strategy registry and the strategy table.
- `package/src/runtime/index.ts` and `package/src/runtime/enforcement.ts` — the install-time merge and the enforcement contract.
- pnpm config dependencies: <https://pnpm.io/config-dependencies> and pnpmfile hooks: <https://pnpm.io/pnpmfile>.
