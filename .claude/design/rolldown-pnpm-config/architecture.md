---
status: current
module: rolldown-pnpm-config
category: architecture
created: 2026-06-25
updated: 2026-06-28
last-synced: 2026-06-28
completeness: 92
related:
  - settings-coverage.md
  - upgrade-cli.md
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

The package also ships a developer-facing `upgrade` CLI that rewrites catalog version ranges in a config file. It is a separate subsystem from the engine and is documented in [upgrade-cli.md](upgrade-cli.md).

Reference this document when changing the engine contract, the descriptor table, the build-to-runtime emit pipeline or the public authoring surface.

## Current state

Phase 1 (the engine) shipped via PR #3 and Phase 3 (full field coverage) landed on `feat/complete-schema`. The authoring API, the strategy engine and the build-to-runtime emit pipeline are implemented, the managed field surface now spans the full workspace-appropriate pnpm setting set (121 fields, up from Silk's 14). The authoring surface has since been consolidated (Phase A) into a single `PnpmConfigPlugin({...})` entry point with inline catalogs, and a developer-facing `upgrade` CLI (Phase B) was added — see [upgrade-cli.md](upgrade-cli.md). The package is intentionally still `private` (pre-publish).

The build-to-runtime pipeline has three stages, each on one side of the build / runtime boundary.

Authoring API (`@public`, build time): authors call `PnpmConfigPlugin({...})` to declare catalogs plus the managed pnpm fields in one canonical, statically analyzable call. Catalogs are inline — `catalogs: { <name>: { packages: { <pkg>: range | { range, peer?, strategy? } } } }`, keyed by catalog name. The `PluginConfig` shape is a hand-authored interface (one `FieldInput<T>` per field, for rich per-field JSDoc and DX), kept in lockstep with the descriptor table by the compile-time drift guard described below. `defineCatalogs` and `definePlugin` were removed; the catalog types and a pure `normalizeCatalogs` now live in `package/src/catalogs.ts`, and the `PluginConfig`/`FieldInput` types in `package/src/define-plugin.ts`.

Build step (`freeze`, the only place Effect runs, `@internal`): `freeze` validates each declared field against its descriptor-derived Schema and emits two plain-data structures — `base` (field to frozen value) and `manifest` (field to `{ strategy, enforcement, options? }`). Invalid config surfaces as a typed `ConfigError`. The schema map (`FIELD_SCHEMAS`) is derived from `DESCRIPTORS`; `catalogs` is special-cased — `freeze` runs `normalizeCatalogs(config.catalogs)` to resolve the inline declarations (including any materialized `<name>Peers` catalogs) before validating. See `package/src/plugin/freeze.ts` and `package/src/catalogs.ts`.

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

The 14 original Silk fields were migrated into the table **parity-locked** — strategy and enforcement preserved verbatim — and were proven byte-identical `{ base, manifest }` against Silk by the differential-parity harness during development, so the descriptor refactor changed no behavior. That harness has since been removed (see [Integration points](#integration-points)); the engine is now covered by its own descriptor-table, freeze and strategy unit tests. The strategy table itself was untouched: this is purely a front-of-pipeline (authoring → freeze) change.

Strategies are grouped by kind under `package/src/runtime/strategies/` and keyed by name in `package/src/runtime/strategies/table.ts`; the manifest references a strategy by that name, so the build emits no strategy code — the runtime owns the implementations. The descriptor table reuses the existing strategies; no new merge engine was added for the expanded field set.

### Data-driven refines, not injected code

Some Silk behavior depends on which repo consumes the plugin and so cannot be a static strategy — chiefly its `WORKSPACE_LOCAL_HOISTS_BY_REPO` hoist exclusion. This is modeled as a data-driven `excludeByRepo` refine on `publicHoistPattern`: `resolveRootName` resolves the consuming repo and `excludeByRepo` drops the assigned packages from the merged hoist list. See `package/src/runtime/ctx.ts`. Arbitrary code-injected refines were deliberately not built — refines are data-driven only, which keeps the manifest plain serializable data.

### Standard plugin, no bundler coupling

The build step ships as `PnpmConfigPlugin`, a standard tsdown/rolldown plugin, so the library never hard-depends on `@savvy-web/bundler`. External consumers on vanilla tsdown can use the plugin directly; the Savvy bundler's plugin passthrough is an ergonomics convenience, not a requirement. This preserves the broad-public-library goal. See `package/src/plugin/index.ts`.

## System architecture

`PnpmConfigPlugin(config)` is constructed with the inline `PluginConfig` object and serves two virtual modules. The Effect `freeze` runs once and is memoized on the plugin closure, because the bundler invokes the plugin across several passes and the validate-freeze-manifest work must not repeat. See `package/src/plugin/index.ts`.

The pnpmfile virtual module is `import { createHooks }` plus deterministically key-sorted `base` and `manifest` literals; the catalogs virtual module is a standalone sorted `Map` literal for programmatic catalog reads. Both are produced by `package/src/plugin/serialize.ts`, whose recursive `sortKeys` keeps emitted artifacts diff-stable.

At install time `createHooks` builds the strategy table from the manifest, resolves the per-install `ctx` once, then for each manifest field runs its strategy, applies any data-driven refine to the merged value, applies enforcement, and accumulates divergences for the two warning boxes before returning the merged config.

## Data flow

Build time: the inline `PluginConfig` flows into `freeze`, which normalizes the catalogs, validates per field and emits `{ base, manifest }`; `PnpmConfigPlugin` serializes that into the two virtual modules the bundler emits as the pnpmfile and the catalogs module.

Install time: pnpm calls `updateConfig(localConfig)`; for each field the runtime merges `base[field]` with `localConfig[field]` via the named strategy, refines and enforces the result, and writes it into the merged config only when it carries content. The merged config crosses back to pnpm; divergence warnings go to the console.

The boundary that must stay stable is the `{ base, manifest }` contract — it is the only thing crossing from build time into the bundled runtime, and both sides are typed by `Base` and `Manifest` in `package/src/runtime/types.ts`.

## Integration points

Consumers integrate by adding `PnpmConfigPlugin({...})` to a tsdown/rolldown build and re-exporting the two virtual specifiers (`rolldown-pnpm-config/virtual/pnpmfile` and `.../virtual/catalogs`); the specifier strings are defined in `package/src/plugin/index.ts`.

During development the engine was validated by a differential-parity harness that diffed its merged `{ base, manifest }` output against Silk's own published pnpmfile across a battery of consumer-config inputs. That harness has been removed — it depended on a sibling Silk checkout whose values drift — and the engine is now covered by its own descriptor-table, freeze, and strategy unit tests under `package/__test__/`.

Three behavioral divergences from Silk are intentional and affect only warning text or robustness, never merged output: the security warning's `detail` string is field-agnostic rather than per-field; `excludeByRepo` runs after the merge (exclude-wins) instead of Silk's filter-before-merge; and the override box has a `Math.max(0, …)` width guard making it strictly more robust than Silk.

## Roadmap

Phase 1 (complete, shipped): the authoring API, the strategy engine and the build-to-runtime emit pipeline, scoped to the fields Silk uses and proven Silk-equivalent.

Phase 3 (complete, on `feat/complete-schema`): the managed field surface grew from Silk's 14 to the full workspace-appropriate pnpm setting set (121 fields) via the descriptor table, reusing the existing strategies with no runtime-engine change. Field-by-field coverage and the classification of excluded keys live in [settings-coverage.md](settings-coverage.md). The descriptor-table design is recorded in [the coverage design spec](specs/2026-06-26-pnpm-settings-coverage-design.md). This is part of the current state.

Phase A (complete, on `feat/cli`): the three authoring entry points were collapsed into a single `PnpmConfigPlugin({...})` call with inline catalogs and materialized-in-source peer ranges. Part of the current state, described above.

Phase B (complete, on `feat/cli`): the `upgrade` CLI that statically discovers, registry-resolves and surgically rewrites catalog version ranges in place, with interactive and non-interactive paths plus peer recompute, drift resync and materialization. Extended on `feat/peer-interop` with a third catalog peer strategy `interop` (a per-catalog group reconcile for packages that declare each other as peers) and a `minimumReleaseAge` gate on all version resolution. CLI-only: the engine is unchanged. Documented in [upgrade-cli.md](upgrade-cli.md).

Pre-publish hardening (cross-cutting, before any release): ship library-owned ambient virtual-module types for external consumers, add real publish metadata and drop `private`, and widen peer ranges. The `interop` strategy gives authors a tool for the last item — deriving coherent group peer floors — though the package is currently `private` and intentionally pre-publish.

## Related documentation

- [settings-coverage.md](settings-coverage.md) — the full enumerated 121-field coverage matrix (key, kind, strategy, enforcement, anchor) and the excluded-key classification.
- [upgrade-cli.md](upgrade-cli.md) — the `upgrade` CLI that rewrites catalog version ranges in place.
- [the coverage design spec](specs/2026-06-26-pnpm-settings-coverage-design.md) — the rationale for the descriptor-table-as-single-source-of-truth design.
- `package/src/descriptors/` — the descriptor table (single source of truth) and the `deriveSchemas`/`deriveRegistry` helpers.
- `package/src/catalogs.ts` and `package/src/define-plugin.ts` — the inline catalog types plus `normalizeCatalogs`, and the hand-authored `PluginConfig`/`FieldInput`.
- `package/src/registry.ts` and `package/src/runtime/strategies/table.ts` — the derived field-to-strategy registry and the strategy table.
- `package/src/runtime/index.ts` and `package/src/runtime/enforcement.ts` — the install-time merge and the enforcement contract.
- pnpm config dependencies: <https://pnpm.io/config-dependencies> and pnpmfile hooks: <https://pnpm.io/pnpmfile>.
