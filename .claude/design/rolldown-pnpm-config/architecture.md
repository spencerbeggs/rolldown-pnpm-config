---
status: current
module: rolldown-pnpm-config
category: architecture
created: 2026-06-25
updated: 2026-07-21
last-synced: 2026-07-21
completeness: 95
related:
  - settings-coverage.md
  - upgrade-cli.md
  - export-cli.md
  - specs/2026-06-26-pnpm-settings-coverage-design.md
  - specs/2026-06-30-patch-distribution-design.md
  - specs/2026-07-20-peer-colon-and-preview-colors-design.md
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

Phase 1 (the engine) shipped via PR #3 and Phase 3 (full field coverage) landed on `feat/complete-schema`. The authoring API, the strategy engine and the build-to-runtime emit pipeline are implemented, the managed field surface now spans the full workspace-appropriate pnpm setting set (121 fields, up from Silk's 14). The authoring surface has since been consolidated (Phase A) into a single `PnpmConfigPlugin({...})` entry point with inline catalogs, and a developer-facing `upgrade` CLI (Phase B) was added — see [upgrade-cli.md](upgrade-cli.md). The build-time stack has since migrated to Effect v4 (see the migration entry under [Roadmap](#roadmap)). The package is intentionally still `private` (pre-publish).

The build-to-runtime pipeline has three stages, each on one side of the build / runtime boundary.

Authoring API (`@public`, build time): authors call `PnpmConfigPlugin({...})` to declare catalogs plus the managed pnpm fields in one canonical, statically analyzable call. Catalogs are inline — `catalogs: { <name>: { packages: { <pkg>: range | { range, peer?, strategy? } } } }`, keyed by catalog name. The `PluginConfig` shape is a hand-authored interface (one `FieldInput<T>` per field, for rich per-field JSDoc and DX), kept in lockstep with the descriptor table by the compile-time drift guard described below. `defineCatalogs` and `definePlugin` were removed; the catalog types and a pure `normalizeCatalogs` now live in `package/src/catalogs.ts`, and the `PluginConfig`/`FieldInput` types in `package/src/define-plugin.ts`.

Build step (`freeze`, the only place Effect runs, `@internal`): `freeze` first validates `config.name` — a missing or empty `name` is a `ConfigError`. It then validates each declared field against its descriptor-derived Schema and emits three plain-data values — `base` (field to frozen value), `manifest` (field to `{ strategy, enforcement, options? }`) and `name` (the validated string). The schema map (`FIELD_SCHEMAS`) is derived from `DESCRIPTORS`; `catalogs` is special-cased — `freeze` runs `normalizeCatalogs(config.catalogs)` to resolve the inline declarations (including any materialized `<name>Peers` catalogs) before validating. `peerDependencyRules` is likewise special-cased: `freeze` resolves an optional `allowedVersionsFromCatalogs` directive against the declared catalogs into concrete `allowedVersions` rules and strips the directive before validating, baking the result into `base` so it reaches both the runtime pnpmfile and `export`. See `package/src/plugin/freeze.ts`, `package/src/catalogs.ts` and `package/src/plugin/allowed-versions.ts`.

Runtime (`createHooks`, zero-dependency, `@public`): `createHooks(base, manifest, name)` returns `{ updateConfig }`. It builds the strategy table, runs each field's strategy, applies the field's enforcement, prints the warning boxes — each tagged `[<name>]` on the first line — and returns the merged config. See `package/src/runtime/index.ts`.

### Load-bearing field shapes

`PluginConfig.name` is a required top-level string — plugin metadata, never written to `pnpm-workspace.yaml` and not a descriptor field. `freeze` validates it (non-empty) and returns it alongside `base` and `manifest`; `serialize.ts` bakes it into the pnpmfile virtual module as the third argument to `createHooks`. This is a breaking change on `createHooks` for any external caller.

`FieldInput<T>` is either a bare `T` or `{ value, enforcement }`, letting an author override the default enforcement per field. `publicHoistPattern` additionally accepts `{ value, excludeByRepo }`. Both live in `package/src/define-plugin.ts`.

`Enforcement` is `absent | warn | error` and a `Divergence` carries `kind: "override" | "security"`, `managedValue` (the plugin's intended value) and `localValue` (what the consuming repo has). All are defined in `package/src/runtime/types.ts` and are the stable contract every strategy and the enforcement step share.

### Public API boundary

The build-time authoring surface plus the runtime entry are `@public`; everything else — the strategies, the descriptor table, the derived field registry, `freeze`, `ConfigError`, the warning-box formatters and the ctx helpers — is `@internal`. The exact `@public` set is the export list of `package/src/index.ts` and the runtime types in `package/src/runtime/types.ts`; treat changes to either as API-surface changes. `createHooks` is `@public` and now has a required third `name: string` parameter — this is a breaking change for any direct consumer of the runtime entry.

## Rationale

### Effect at build time only

The user's framing was "compile Effect away". Statically erasing Effect's fiber runtime from arbitrary programs is infeasible, so instead Effect is fenced to `freeze` and never crosses into the bundle. The bundled output contains zero Effect, verified because the runtime imports nothing external.

This is why `EnforcementError` is a plain `Error` subclass rather than an Effect tagged error — it must survive bundling into a dependency-free pnpmfile. See `package/src/runtime/enforcement.ts`.

### Effect v4 collapses the declared peer closure

The build-time/CLI dependency surface is Effect v4 (`catalog:effect`, currently `4.0.0-beta.99`): `effect` plus `@effect/platform-node`. Nothing else from the Effect org is declared.

This is a deliberate reversal of the v3-era arrangement. Under v3, `package/package.json` declared the full non-optional peer closure of `@effect/platform-node` and `@effect/cli` (`@effect/cluster`, `@effect/experimental`, `@effect/printer`, `@effect/printer-ansi`, `@effect/rpc`, `@effect/sql`, `@effect/typeclass`, `@effect/workflow`) as regular `dependencies` even though nothing in `package/src/` imported them — left undeclared, pnpm's `autoInstallPeers` resolved those peers inside every consuming workspace and polluted consumer lockfiles (savvy-web/systems#228). Declaring them pinned resolution to this package's own subtree.

Under v4 that workaround is obsolete and the closure was removed: v4 folds the satellite packages into `effect` itself (the CLI now lives at `effect/unstable/cli`, process spawning at `effect/unstable/process`), and `@effect/platform-node` v4 peers only on `effect`. There is no closure left to leak, so `autoInstallPeers` has nothing to resolve into a consumer. Do not re-add the v3 satellites, and do not read the historical "do not prune as unused" guidance as still applying — the current two dependencies are both genuinely imported.

This remains a build-time/CLI manifest concern only; the shipped pnpmfile is zero-dependency either way.

### Vendored v4 source as the API authority

Effect v4 is pre-release and its published docs lag the code, so the v4 source is vendored read-only under `.repos/` (`.gitmodules`, `.repos/config.json`), pinned to the exact `effect@4.0.0-beta.99` the catalog resolves. The submodule directory is still named `effect-smol`, but that upstream repo was archived and v4 development moved back to the main `Effect-TS/effect` monorepo (same layout), so the source is now vendored from there. It is the authority for v4 API shapes during the beta and is never imported by the build — consult it when a v4 signature is in question rather than inferring from v3 memory or stale docs.

### Detection separated from response

A strategy is a pure `(base, local, ctx) => { merged, divergences }`. Strategies only *detect* divergences and classify each by `kind`; they never decide what to do about one. The response lives in `applyEnforcement`, which routes `warn` divergences to the override or security console boxes by kind and throws `EnforcementError` on `error`, while `absent` is silent. This split lets the same strategy serve every enforcement level. See `package/src/runtime/enforcement.ts`.

The runtime deliberately has no catch-and-fall-back-to-local guard: an `error`-enforced divergence must propagate and fail the install. If a swallow-guard is ever added it must rethrow `EnforcementError` rather than fall back. The rationale is recorded inline at the top of `package/src/runtime/index.ts`.

### Descriptor table as the single source of truth

Each managed pnpm field is one entry in a declarative descriptor table under `package/src/descriptors/`, carrying its validation `schema`, `kind`, merge `strategy`, default `enforcement`, doc string and optional refine `options`. The table is split across category modules (resolution, hoisting, lockfile, build, runtime-cfg, workspace, misc, network) merged with `satisfies` into one `DESCRIPTORS` object in `package/src/descriptors/index.ts`. The `satisfies` (never a `: FieldDescriptors` annotation) is load-bearing: it preserves each entry's narrow schema type so the drift guard can read per-field value types. See `package/src/descriptors/types.ts` for the `FieldDescriptor<A>` shape.

What code consumes is **derived** from the table, not hand-listed: `deriveSchemas(DESCRIPTORS)` produces `FIELD_SCHEMAS` (consumed by `freeze`) and `deriveRegistry(DESCRIPTORS)` produces `FIELD_REGISTRY` (`package/src/registry.ts` is now three lines). Adding a field is a single descriptor entry plus its matching `PluginConfig` line — the schema, registry and table-driven tests all follow from it.

The hand-authored `PluginConfig` interface is kept honest by a value-level drift guard at `package/__test__/types/plugin-config.test-d.ts`: a compile-time assertion that each authored field's type and its descriptor-derived type are mutually assignable, so widening an authored field (e.g. `string` against a `Schema.Literal(...)` union) or dropping one breaks `typecheck`. Three keys are key-checked only — `catalogs` (authored as `CatalogsResult`), `publicHoistPattern` (carries the `excludeByRepo` refine the schema does not model) and `peerDependencyRules` (carries the build-time `allowedVersionsFromCatalogs` directive the schema does not model). Every descriptor is also exercised by the table-driven suite at `package/__test__/descriptors/table.test.ts` (strategy exists in `STRATEGY_TABLE`; schema accepts/rejects samples).

The 14 original Silk fields were migrated into the table **parity-locked** — strategy and enforcement preserved verbatim — and were proven byte-identical `{ base, manifest }` against Silk by the differential-parity harness during development, so the descriptor refactor changed no behavior. That harness has since been removed (see [Integration points](#integration-points)); the engine is now covered by its own descriptor-table, freeze and strategy unit tests. The strategy table itself was untouched: this is purely a front-of-pipeline (authoring → freeze) change.

Strategies are grouped by kind under `package/src/runtime/strategies/` and keyed by name in `package/src/runtime/strategies/table.ts`; the manifest references a strategy by that name, so the build emits no strategy code — the runtime owns the implementations. The descriptor table reuses the existing strategies; no new merge engine was added for the expanded field set.

### Data-driven refines, not injected code

Some Silk behavior depends on which repo consumes the plugin and so cannot be a static strategy — chiefly its `WORKSPACE_LOCAL_HOISTS_BY_REPO` hoist exclusion. This is modeled as a data-driven `excludeByRepo` refine on `publicHoistPattern`: `resolveRootName` resolves the consuming repo and `excludeByRepo` drops the assigned packages from the merged hoist list. See `package/src/runtime/ctx.ts`. Arbitrary code-injected refines were deliberately not built — refines are data-driven only, which keeps the manifest plain serializable data.

### Standard plugin, no bundler coupling

The build step ships as `PnpmConfigPlugin`, a standard tsdown/rolldown plugin, so the library never hard-depends on `@savvy-web/bundler`. External consumers on vanilla tsdown can use the plugin directly; the Savvy bundler's plugin passthrough is an ergonomics convenience, not a requirement. This preserves the broad-public-library goal. See `package/src/plugin/index.ts`.

## System architecture

`PnpmConfigPlugin(config)` is constructed with the inline `PluginConfig` object and serves two virtual modules. The Effect `freeze` runs once and is memoized on the plugin closure, because the bundler invokes the plugin across several passes and the validate-freeze-manifest work must not repeat. See `package/src/plugin/index.ts`.

The pnpmfile virtual module is `import { createHooks }` plus deterministically key-sorted `base` and `manifest` literals and the `name` string literal as the third argument; the catalogs virtual module is a standalone sorted `Map` literal for programmatic catalog reads. Both are produced by `package/src/plugin/serialize.ts`, whose recursive `sortKeys` keeps emitted artifacts diff-stable.

At install time `createHooks` builds the strategy table from the manifest, resolves the per-install `ctx` once, then for each manifest field runs its strategy, applies any data-driven refine to the merged value, applies enforcement, and accumulates divergences for the two warning boxes before returning the merged config.

## Data flow

Build time: the inline `PluginConfig` flows into `freeze`, which normalizes the catalogs, validates `name` and each field, and emits `{ base, manifest, name }`; `PnpmConfigPlugin` serializes that into the two virtual modules the bundler emits as the pnpmfile and the catalogs module.

Install time: pnpm calls `updateConfig(localConfig)`; for each field the runtime merges `base[field]` with `localConfig[field]` via the named strategy, refines and enforces the result, and writes it into the merged config only when it carries content. The merged config crosses back to pnpm; divergence warnings — tagged `[<name>]` — go to the console.

The boundary that must stay stable is the `{ base, manifest, name }` contract — it is the only thing crossing from build time into the bundled runtime, and the data shapes are typed by `Base`, `Manifest` and the literal `name: string` in `package/src/runtime/index.ts`.

## Integration points

Consumers integrate by adding `PnpmConfigPlugin({...})` to a tsdown/rolldown build and re-exporting the two virtual specifiers (`rolldown-pnpm-config/virtual/pnpmfile` and `.../virtual/catalogs`); the specifier strings are defined in `package/src/plugin/index.ts`.

`package/src/virtual.d.ts` declares the ambient types for those two specifiers, opted into with `/// <reference types="rolldown-pnpm-config/virtual" />`. It is load-bearingly self-contained: the file ships byte-for-byte and is never compiled, so any cross-module import inside it (for example pulling `PnpmHooks` from `rolldown-pnpm-config/runtime`) resolves against this package's own *source* `exports` map during the bundler's declaration pass and drags a raw `.ts` file into API Extractor's analysis (`ae-wrong-input-file-type`). The minimal `PnpmConfig`/`hooks.updateConfig` shape is therefore inlined and must be kept in sync by hand with `package/src/runtime/types.ts` — the duplication is deliberate and the sync note lives in the file.

During development the engine was validated by a differential-parity harness that diffed its merged `{ base, manifest }` output against Silk's own published pnpmfile across a battery of consumer-config inputs. That harness has been removed — it depended on a sibling Silk checkout whose values drift — and the engine is now covered by its own descriptor-table, freeze, and strategy unit tests under `package/__test__/`.

Three behavioral divergences from Silk are intentional and affect only warning text or robustness, never merged output: the security warning's `detail` string is field-agnostic rather than per-field; `excludeByRepo` runs after the merge (exclude-wins) instead of Silk's filter-before-merge; and the override box has a `Math.max(0, …)` width guard making it strictly more robust than Silk.

## Roadmap

Phase 1 (complete, shipped): the authoring API, the strategy engine and the build-to-runtime emit pipeline, scoped to the fields Silk uses and proven Silk-equivalent.

Phase 3 (complete, on `feat/complete-schema`): the managed field surface grew from Silk's 14 to the full workspace-appropriate pnpm setting set (121 fields) via the descriptor table, reusing the existing strategies with no runtime-engine change. Field-by-field coverage and the classification of excluded keys live in [settings-coverage.md](settings-coverage.md). The descriptor-table design is recorded in [the coverage design spec](specs/2026-06-26-pnpm-settings-coverage-design.md). This is part of the current state.

Phase A (complete, on `feat/cli`): the three authoring entry points were collapsed into a single `PnpmConfigPlugin({...})` call with inline catalogs and materialized-in-source peer ranges. Part of the current state, described above.

Phase B (complete, on `feat/cli`): the `upgrade` CLI that statically discovers, registry-resolves and surgically rewrites catalog version ranges in place, with interactive and non-interactive paths plus peer recompute, drift resync and materialization. Extended on `feat/peer-interop` with a third catalog peer strategy `interop` (a per-catalog group reconcile for packages that declare each other as peers) and a `minimumReleaseAge` gate on all version resolution. CLI-only: the engine is unchanged. Documented in [upgrade-cli.md](upgrade-cli.md).

UI updates (complete, on `feat/ui-updates`): four related bodies of work. (1) `PluginConfig.name` became required — `freeze` validates it and returns it alongside `{ base, manifest }`; `createHooks` gains a required third `name` parameter and tags every warning box `[<name>]`. (2) All "silk" references removed from the runtime: `Divergence.silkValue`/`childValue` renamed to `managedValue`/`localValue`, warning copy and strategy internals de-silked. (3) A shared CLI diff/render layer (`cli/ui/styled.ts`, `cli/ui/ansi.ts`, `cli/ui/env.ts`, `cli/diff/`) makes `export --dry-run` and `upgrade --preview/--full` speak the same visual language; `upgrade` gains a non-TTY fallback that never hangs in CI. (4) `export` was restructured with a post-freeze local-merge pipeline — `LocalDirective` semantics, automatic `file:`/`link:`/`workspace:`/`portal:` override preservation, and `excludeByRepo` applied at export time — and a separate interactive `preview` command with `ink-tab` tabs over Changes/Full/Simulated views. Documented in [export-cli.md](export-cli.md).

Patch distribution (complete, on `feat/patch-support`): a plugin author can distribute pnpm dependency patches through their config-dependency plugin. A new build/CLI-side module `package/src/patches/` discovers `.patch` files in two convention folders adjacent to the build file (`public/patches/` = distributed, `patches/` = local-only), reverses pnpm's `/`→`__` filename mangling to derive the `patchedDependencies` key, and rewrites distributed paths to `node_modules/.pnpm-config/<name>/<rel>`. The build bakes the rewritten distributed map into `base.patchedDependencies`; `export` overrides it with local on-disk paths merged by key so sibling plugins' and repo-own entries survive. The descriptor table is unchanged — this is an authoring-layer discovery/rewrite on top of the existing `patchedDependencies` descriptor. The Effect-at-build-time boundary holds: `patches/**` is build-side only (never imported by `runtime/**`) and `freeze` still receives plain data. Documented in [export-cli.md](export-cli.md); design recorded in [the patch distribution spec](specs/2026-06-30-patch-distribution-design.md).

Effect v4 migration (complete, on `feat/effected`): the build-time/CLI stack moved from Effect v3 to v4 (`4.0.0-beta.98`, via `catalog:effect`). Boundary-level consequences: the v3 satellite dependency closure was removed from `package/package.json` (see [the rationale above](#effect-v4-collapses-the-declared-peer-closure)); the CLI command layer moved from `@effect/cli` to `effect/unstable/cli` (`Args`→`Argument`, `Options`→`Flag`, new `Command.run` shape); process execution moved from `@effect/platform`'s `CommandExecutor` to `effect/unstable/process`'s `ChildProcessSpawner`; Schema call sites moved to v4 forms (`Literal`→`Literals`, `Schema.Schema`→`Schema.Codec`, `decodeUnknown`→`decodeUnknownEffect`) across `package/src/descriptors/**`; `Effect.async`→`Effect.callback`, `Effect.either`→`Effect.result`, and `Context.Tag` services→the `Context.Service` class form. Two non-Effect deps were swapped for drop-in equivalents over the used surface: `yaml`→`@effected/yaml` and `semver-effect`→`@effected/semver`. This is a build-time/CLI-layer migration only — the descriptor table's field semantics, the strategy engine, the `{ base, manifest, name }` contract and the zero-dependency shipped runtime are all unchanged.

Pre-publish hardening (cross-cutting, before any release): add real publish metadata and drop `private`, and widen peer ranges. The `interop` strategy gives authors a tool for the last item — deriving coherent group peer floors — though the package is currently `private` and intentionally pre-publish. Library-owned ambient virtual-module types now ship (`package/src/virtual.d.ts`, opted into with `/// <reference types="rolldown-pnpm-config/virtual" />`); see [Integration points](#integration-points) for the constraint that file carries.

## Related documentation

- [settings-coverage.md](settings-coverage.md) — the full enumerated 121-field coverage matrix (key, kind, strategy, enforcement, anchor) and the excluded-key classification.
- [upgrade-cli.md](upgrade-cli.md) — the `upgrade` CLI that rewrites catalog version ranges in place.
- [export-cli.md](export-cli.md) — the `export` and `preview` CLI commands, the shared diff/render layer and local merge semantics.
- [the coverage design spec](specs/2026-06-26-pnpm-settings-coverage-design.md) — the rationale for the descriptor-table-as-single-source-of-truth design.
- [the patch distribution spec](specs/2026-06-30-patch-distribution-design.md) — the intended behavior for distributing pnpm dependency patches through a config-dependency plugin.
- `package/src/descriptors/` — the descriptor table (single source of truth) and the `deriveSchemas`/`deriveRegistry` helpers.
- `package/src/patches/` — the build/CLI-side patch discovery and path-rewrite module (`keys.ts`, `paths.ts`, `discover.ts`, `build.ts`, `reconcile.ts`); never imported by `runtime/**`.
- `package/src/catalogs.ts` and `package/src/define-plugin.ts` — the inline catalog types plus `normalizeCatalogs`, the hand-authored `PluginConfig`/`FieldInput` and the `LocalDirective` type.
- `package/src/plugin/allowed-versions.ts` — the `allowedVersionsFromCatalogs` authoring directive, resolved at freeze time into `peerDependencyRules.allowedVersions` and baked into `base`.
- `package/src/registry.ts` and `package/src/runtime/strategies/table.ts` — the derived field-to-strategy registry and the strategy table.
- `package/src/runtime/index.ts` and `package/src/runtime/enforcement.ts` — the install-time merge and the enforcement contract.
- `package/src/runtime/warnings.ts` and `package/src/runtime/types.ts` — the warning-box formatters (now `name`-tagged) and the `Divergence` type.
- pnpm config dependencies: <https://pnpm.io/config-dependencies> and pnpmfile hooks: <https://pnpm.io/pnpmfile>.
