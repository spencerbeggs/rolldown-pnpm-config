# rolldown-pnpm-config — Phase 1 Design

- **Status:** **Phase 1 COMPLETE** (2026-06-25). Subsystems 1+2+3 shipped across M1 (catalogs skeleton), M2 (full strategy engine), M3 (Silk parity proven). The library is a faithful Silk replacement: differential merge-parity against Silk's own pnpmfile passes for all Silk-real inputs (see `phase1-m3-design.md`). Next: Phase 2 (CLI resolver) / Phase 3 (full schema) — separate cycles.
- **Date:** 2026-06-24 (Phase 1 closed 2026-06-25)
- **Author repo (this package):** `/Users/spencer/workspaces/spencerbeggs/rolldown-pnpm-config`
- **Extraction source / proof target (Silk):** `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk`
- **Implementation note:** This spec is written to be executed by an agent in a
  separate session. All cross-repo references use absolute paths. Read the Silk
  source files cited in the "Source extraction map" before implementing — the
  Phase 1 acceptance gate is behavioral parity with that code.
- **Rename in progress:** the repo and module were renamed from
  `pnpm-config-builder` → **`rolldown-pnpm-config`** (it ships a rolldown plugin).
  The on-disk scaffold may still carry the old name until the rename lands; an
  early implementation step must update: `package/package.json` (`name`, `bin`
  key, `repository.url`/`directory`), `example/package.json` (the
  `"pnpm-config-builder": "workspace:*"` devDependency → `rolldown-pnpm-config`),
  and the GitHub repo URL. The author-repo path above assumes the post-rename
  directory name.

---

## 1. Context & motivation

`@savvy-web/pnpm-plugin-silk` is a working pnpm **config-dependency** plugin: a
self-contained `pnpmfile.mjs`/`.cjs` loaded by pnpm 11 that, via the
`updateConfig` hook, merges centrally-managed catalogs and settings into each
consuming repo's pnpm config — with per-field merge strategies, override
warnings, and security-default enforcement.

We want to extract its reusable core into a **broad, publicly-publishable
library** for authoring *arbitrary* pnpm config plugins, not just Silk.

### Priorities (ranked, from the user)

1. **Author ergonomics** (highest — never compromise the declarative API for the others)
2. Reusability (stand up new plugins cheaply)
3. Smaller bundles (ship lightweight config dependencies)

### Key constraint that shapes everything: the build-time / runtime split

Config dependencies cannot have runtime dependencies — everything must be
bundled into the shipped `pnpmfile`. Silk bundles all of Effect, which is heavy.

**Decision:**

> Effect lives **only at build time**, on the author's machine / CI. The build
> step emits **frozen plain-data config + a field→strategy manifest**, and the
> shipped artifact bundles a **tiny, zero-dependency, pure-JS runtime** that
> carries the strategy *implementations*, warning/security formatters, and
> install-time helpers. Effect never crosses into the artifact.

A note on the user's original framing ("compile Effect away via a tsdown
plugin"): the *AST-transform* reading of that — statically erasing Effect's
fiber runtime / Layer / Context machinery from arbitrary programs — is
infeasible. But a tsdown **plugin** is exactly the right *host* for the
build-time step: it runs the Effect validate/freeze/manifest codegen during the
normal build and injects the result, while the bundled output stays pure JS. So
we keep the build-time/runtime split above, and implement the build-time half as
a tsdown plugin (see §3, §6) rather than a bespoke driver.

"Injecting business-logic code into the bundle for the user" is the intended
model (confirmed by the user), not a problem to avoid. What does **not** ship is
Effect and the codegen/validation layer.

---

## 2. Scope: decomposition & phased roadmap

The full vision is five independent subsystems. **This spec covers Phase 1
only.** The other phases get their own spec → plan → implementation cycles.

> **Phase 1 status (COMPLETE, 2026-06-25):** subsystems 1+2+3 (below) are shipped and proven. M1 stood up the catalogs-only skeleton; M2 generalized it into the full strategy engine (all ~13 Silk fields, per-field enforcement, override/security detection); M3 transcribed Silk's entire managed config as a `silk.config.ts` and proved the engine's merged output deep-equals Silk's own pnpmfile across a differential battery (the dogfood proof). Subsystems 4 (Phase 2) and 5 (Phase 3) remain.

1. **Authoring API** — `definePlugin` / `defineCatalogs` + type modeling *(Phase 1, scoped)*
2. **Strategy engine** — hybrid merge model (known fields + escape hatch) + warning/security detection *(Phase 1)*
3. **Build→runtime emit pipeline** — Effect at build time → frozen data + manifest + tiny runtime *(Phase 1)*
4. **CLI version resolver** — registry queries, peer/lock-to-minor rules, rewrites `defineCatalogs` source *(Phase 2)*
5. **Exhaustive pnpm-schema coverage** — typed knowledge of all ~100+ pnpm-workspace fields *(Phase 3, additive)*

### Phase 1 deliverable

The library (subsystems 1+2+3) scoped to **only the ~13 fields Silk actually
uses**, PLUS **Silk re-implemented on top of the library** as the dogfood proof.
The build-time step is delivered as **`PnpmConfigPlugin`** (a tsdown plugin, §6)
emitting **two virtual modules**: the pnpmfile `hooks` and a standalone
`catalogs` `Map` export for programmatic catalog reads (§3.2).

Phase 1 in-scope fields (everything Silk touches today):

- `catalogs` (named catalogs, incl. the `silk` / `silkPeers` pair)
- `overrides`
- `publicHoistPattern`
- `allowBuilds`
- `strictDepBuilds`, `blockExoticSubdeps`, `minimumReleaseAge` (security scalars)
- `minimumReleaseAgeExclude` (array)
- `packageExtensions`, `allowedDeprecatedVersions` (maps)
- `supportedArchitectures`, `auditConfig` (array-record maps)
- `confirmModulesPurge` (plain behavioral default)
- `peerDependencyRules`

Explicitly deferred: the CLI resolver (Phase 2), full schema coverage (Phase 3),
exact peer-range widening math (shape fixed now, math is Phase 2).

> "Broad public library" and "extract from Silk first" are **not** in conflict.
> Extracting a proven core from the one working plugin is the de-risking path
> *toward* the public library.

### Phase 1 prerequisite: `@savvy-web/bundler` plugin passthrough — DONE

The build-time step is hosted in a tsdown plugin (see §3/§6), and the example
consumer builds via `@savvy-web/bundler` (`defineBuild`/`runBuild`), which must
forward user plugins into every tsdown pass.

**Status: shipped in `@savvy-web/bundler@0.11.0`.** `defineBuild` now accepts a
`plugins` option, forwarded into the internal `extraPlugins` that applies to all
tsdown passes (JS, dts, declarations, and each looseFiles pass). Both `package/`
and `example/` are on `^0.11.0`. No further bundler work is required for Phase 1.

**Decoupling guarantee:** because `PnpmConfigPlugin` is a *standard* tsdown
plugin, the library never hard-depends on `@savvy-web/bundler`. External users on
vanilla tsdown can consume the plugin directly; the bundler `plugins` passthrough
is an ergonomics convenience for the Savvy ecosystem, not a requirement. This
preserves the "broad public library" goal.

---

## 3. Repo layout, package surfaces & build flow

### 3.1 Repo layout (already scaffolded)

The target repo is a two-package pnpm workspace:

- **`package/`** — the library, published as **`rolldown-pnpm-config`**. Has a
  `rolldown-pnpm-config` CLI bin already scaffolded (`package/src/cli/index.ts`,
  reserved for the Phase 2 resolver). Built with the repo's `@savvy-web/bundler`
  pipeline.
- **`example/`** — a sample consumer plugin (**`pnpm-plugin-example`**). The
  declarative config is written **inline in `savvy.build.ts`** and passed to the
  plugin; `src/pnpmfile.ts` and `src/index.ts` are thin re-exports of virtual
  modules the plugin fills:

  ```ts
  // example/savvy.build.ts
  import { defineBuild, runBuild } from "@savvy-web/bundler";
  import { PnpmConfigPlugin, definePlugin, defineCatalogs } from "rolldown-pnpm-config";

  const plugin = definePlugin({
    catalogs: defineCatalogs([
      { name: "silk", peers: true, packages: { "module-name": "^1.0.0" } },
    ]),
    minimumReleaseAge: { value: 1440, enforcement: "warn" },
  });

  export default defineBuild({
    plugins: [PnpmConfigPlugin(plugin)],
    meta: false,
    bundleNodeModules: true,
    looseFiles: {
      "pnpmfile.mjs": "./src/pnpmfile.ts",
      "pnpmfile.cjs": "./src/pnpmfile.ts",
    },
  });
  ```

  ```ts
  // example/src/pnpmfile.ts — the pnpm config-dependency entry
  export { hooks } from "rolldown-pnpm-config/virtual/pnpmfile";
  ```

  ```ts
  // example/src/index.ts — the package's "." entry, for programmatic catalog reads
  export { catalogs } from "rolldown-pnpm-config/virtual/catalogs";
  ```

**Config wiring is resolved:** the declarative config is passed to
`PnpmConfigPlugin(...)` directly in the build file (no separate `*.config.ts`,
no filename convention). This closes former open decision #1.

### 3.2 Package surfaces

`rolldown-pnpm-config` exposes:

- **build-time surface** (Effect allowed) — `definePlugin`, `defineCatalogs`,
  `strategies.*` combinators, and **`PnpmConfigPlugin`** (the tsdown plugin that
  hosts the build-time step). Runs on the author's machine / CI only.
- **runtime shim** (zero-dependency, pure JS) — the strategy *implementations*,
  warning/security-detection formatters, and install-time helpers (consumer
  `package.json` reading). Bundled into the emitted pnpmfile. Exposed at a
  dedicated subpath (e.g. `rolldown-pnpm-config/runtime`).
- **virtual-module type declarations** — ambient `.d.ts` for the two virtual
  specifiers the plugin resolves, so a consumer's `types:check` (`tsgo --noEmit`)
  passes on `pnpmfile.ts`/`index.ts`:
  - `rolldown-pnpm-config/virtual/pnpmfile` → `export const hooks: <PnpmHooks>`
  - `rolldown-pnpm-config/virtual/catalogs` → `export const catalogs: Map<string, Map<string, string>>`

The `exports` map must expose the runtime + the virtual type decls. The runtime
entry must have **no** import of Effect or any other dependency (enforce with a
test — see §9).

> **Virtual specifiers (two, by decision):** the pnpmfile pass imports `hooks`
> from `.../virtual/pnpmfile`; the `.` entry imports `catalogs` from
> `.../virtual/catalogs`. The split keeps the two passes from cross-pulling code
> and gives each a focused ambient type decl. The `catalogs` value is a
> `Map<string, Map<string, string>>` (catalog name → package → resolved range),
> e.g. `new Map([["silk", new Map([["module-name", "^1.0.0"]])], ["silkPeers", new Map([...])]])`.

### 3.3 Build flow (no bespoke driver)

There is **no** custom `build()` driver. Two builds, both via `@savvy-web/bundler`
(itself tsdown-based):

1. **Building the library** (`package/`) → normal `defineBuild`/`runBuild`. No
   toolchain change.
2. **Building a consumer plugin** (`example/`, and eventually Silk) → ordinary
   `defineBuild` with `plugins: [PnpmConfigPlugin(plugin)]`. The plugin does the
   validate/freeze/manifest codegen at build time and serves the two virtual
   modules; the bundler emits the pnpmfile loose files (`hooks`) and the `.`
   entry (`catalogs`) in their respective passes. The bundler `plugins` option is
   shipped (`@savvy-web/bundler@0.11.0`).

See §6 for what `PnpmConfigPlugin` does internally.

---

## 4. Authoring API (subsystem 1)

The author builds one config object via `definePlugin` and passes it to
`PnpmConfigPlugin(...)` in the build file (§3.1). Known pnpm fields are one-liners
carrying default strategies; each accepts a bare value **or** a
`{ value, enforcement }` / `strategies.*`-wrapped form to override behavior. The
`catalogs` declared here drive **both** the merged-catalog hook output and the
`catalogs` virtual export (§3.2).

```ts
import { definePlugin, defineCatalogs, strategies } from "rolldown-pnpm-config";

const catalogs = defineCatalogs([
  {
    name: "silk",
    peers: true,                       // also emits the silkPeers catalog
    packages: {
      typescript: "^5.9.0",            // shorthand: range only
      vitest: { range: "^4.0.0", peer: "lock-to-minor" },
    },
  },
]);

const plugin = definePlugin({
  catalogs,
  overrides: { "tar@<6.2.1": ">=6.2.1" },            // default: child-wins + warn
  publicHoistPattern: ["@types/*"],                  // default: array-union
  allowBuilds: { esbuild: true },                    // default: map child-wins
  strictDepBuilds: { value: true, enforcement: "warn" },   // security scalar
  minimumReleaseAge: { value: 1440, enforcement: "error" },

  // escape hatch — unknown/new pnpm field; author MUST pick a strategy:
  someNewPnpmField: strategies.scalar(42, { enforcement: "warn" }),
});

// → passed to the build: defineBuild({ plugins: [PnpmConfigPlugin(plugin)], ... })
```

### 4.1 Unified `enforcement` model (applies to every field)

- `"warn"` — child may override; prints a prominent warning (today's
  security-warning behavior, generalized to all fields).
- `"error"` — child cannot weaken it; the hook throws.
- *absent* — silent child-wins (today's plain behavioral default, e.g.
  `confirmModulesPurge`).

This unifies the user's point #1 (`minimumReleaseAge` as
`number | { value, enforcement }`) uniformly across all fields.

### 4.2 `defineCatalogs` model

- `peers: true` auto-derives a permissive peer catalog (`<name>Peers`) from the
  same package set.
- `peer: "lock-to-minor"` per-package controls peer-range widening (e.g.
  `^4.0.0` → `>=4.0.0 <5`). **Phase 1 fixes the shape only**; exact widening math
  is Phase 2 resolver territory. Phase 1 may implement a simple, documented
  default widening and leave a clear seam for Phase 2.
- Package value is `string` (range) **or** `{ range: string; peer?: "lock-to-minor" | ... }`.

### 4.3 Custom strategies are code, not data

`strategies.scalar(...)` and any author-defined strategy are bundled into the
runtime artifact (the "inject code" model). Built-in known-field strategies are
referenced **by name** in the manifest; custom strategies are referenced by a
generated ref and bundled as functions.

---

## 5. Strategy engine (subsystem 2)

> **As-built note (M2 shipped):** the sketch below predates implementation. The shipped strategy signature is `{ merged, divergences }` (a single `Divergence[]` carrying a `kind: "override" | "security"`), not `{ merged, warnings, security }`, and the install-time-conditional logic is a **data-driven `excludeByRepo` refine**, not an arbitrary `refine` callback (arbitrary code injection is deferred). The authoritative as-built contract is `phase1-m2-design.md §4` and supersedes §5.1–§5.4 here.

A **strategy** is a pure, named function with one signature:

```ts
type Strategy<T> = (
  base: T | undefined,
  local: T | undefined,
  ctx: RuntimeCtx,
) => { merged: T | undefined; warnings: Warning[]; security: SecurityWarning[] };
```

- `base` — the plugin's frozen value
- `local` — the consuming repo's pnpm config value
- `ctx` — install-time context: consumer root name/dir + helpers (see §6)

### 5.1 Built-in strategy table (maps 1:1 onto Silk's current merge functions)

| Built-in | Replaces (Silk source) | Default for |
| --- | --- | --- |
| `scalar` | `mergeScalar` (+ security detect) | `strictDepBuilds`, `blockExoticSubdeps`, `minimumReleaseAge`, `confirmModulesPurge` |
| `mapChildWins` | `mergeMap` | `allowBuilds`, `packageExtensions`, `allowedDeprecatedVersions` |
| `arrayUnion` | `mergeStringArrays` | `publicHoistPattern`, `minimumReleaseAgeExclude` |
| `arrayRecordUnion` | `mergeArrayRecord` | `supportedArchitectures`, `auditConfig` |
| `catalog` | `mergeSingleCatalog` (warn-on-override) | `catalogs.*` |
| `overrides` | `mergeOverrides` | `overrides` |
| `peerDependencyRules` | `mergePeerDependencyRules` | `peerDependencyRules` |

### 5.2 Hybrid resolution

A built-in **field registry** maps each known pnpm field → its default strategy.
`definePlugin` walks the author config:

- known field, bare value → registry default strategy
- field wrapped in `strategies.*` → that strategy
- **unknown field → MUST be wrapped** (type error otherwise). The mandatory
  escape hatch keeps unknowns type-safe and explicit.

The registry is the artifact Phase 3 grows. Adding a known field later is purely
additive.

### 5.3 Manifest output

Build emits, per field: `{ field, strategy: "<builtin-name>" | "<custom-ref>", options }`.
Built-ins resolve by name against the runtime's strategy table; custom strategies
are bundled as functions and referenced by ref. Frozen `base` values live
alongside as plain data.

### 5.4 `refine` escape for install-time-conditional logic

Some logic depends on *which repo consumes the plugin* and so cannot be a static
strategy. In Silk this is `WORKSPACE_LOCAL_HOISTS_BY_REPO` + `resolveRootName`
(see `update-config.ts:99-126,162-169`).

Model it as an optional per-field **`refine` callback** in `definePlugin`:

```ts
refine?: (merged: T | undefined, ctx: RuntimeCtx) => T | undefined
```

It runs after the field's strategy, receives `ctx` (consumer root name/dir), and
is bundled as code. **Silk's hoist filter becomes a `refine` on
`publicHoistPattern`.**

---

## 6. `PnpmConfigPlugin` — the build-time step (subsystem 3)

`PnpmConfigPlugin(plugin)` is a **standard tsdown/rolldown plugin** exported from
`rolldown-pnpm-config`, constructed with the `definePlugin` result. It is the
**only** place Effect runs, and it runs inside plugin hooks at build time
(`Effect.runPromise` within the hook). The bundled output contains zero Effect.

It resolves **two** virtual specifiers, each consumed by a different entry:

```ts
// example/src/pnpmfile.ts  →  bundled into pnpmfile.mjs/.cjs via looseFiles
export { hooks } from "rolldown-pnpm-config/virtual/pnpmfile";

// example/src/index.ts  →  bundled into the package "." entry
export { catalogs } from "rolldown-pnpm-config/virtual/catalogs";
```

The generated `.../virtual/pnpmfile` module is conceptually:

```ts
import { createHooks } from "rolldown-pnpm-config/runtime";
// base + manifest + refs inlined as plain data/functions by the plugin
export const hooks = createHooks(base, manifest, refs);
```

The generated `.../virtual/catalogs` module is the frozen catalogs as a Map:

```ts
export const catalogs = new Map([
  ["silk", new Map([["module-name", "^1.0.0"]])],
  ["silkPeers", new Map([["module-name", ">=1.0.0 <2"]])],
]);
```

Plugin responsibilities (in hook order):

1. **Receive** the `definePlugin` config as the plugin argument (config wiring is
   resolved — no file discovery; see §3.1).
2. **Validate** with Effect Schema against a registry-aware schema. Failures are
   typed (`ConfigError`) and surfaced as build errors with field paths.
3. **Freeze**: resolve catalogs (Phase 1: pass-through of declared ranges +
   simple peer widening; Phase 2 CLI fills latest) → plain-data `base`.
4. **Manifest**: build `{ field → strategy ref + options }`.
5. **Serve both virtual modules** (`resolveId` + `load`):
   - `.../virtual/pnpmfile` → `createHooks` wiring over `base` + `manifest` +
     custom/`refine` functions. Because both `looseFiles` keys (`.mjs`/`.cjs`)
     map to the same `src/pnpmfile.ts`, the two artifacts come from one injected
     source and are guaranteed identical.
   - `.../virtual/catalogs` → the `Map<string, Map<string, string>>` of frozen
     catalogs (every named catalog incl. the auto-derived `*Peers`).

**Shipped ambient types:** the library ships `.d.ts` for both virtual specifiers
(`hooks`, `catalogs`) so a consumer's `tsgo --noEmit` resolves the re-exports.

**Determinism discipline** (port from Silk's
`generate/generate-catalogs.ts`): recursive key sorting (`sortKeys`) and stable
formatting of both emitted virtual modules — so artifacts stay diff-stable.

**Composition note:** `PnpmConfigPlugin` composes with the bundler's internal
`@savvy-web/tsdown-plugins`; `@savvy-web/bundler@0.11.0` appends user `plugins`
after its internal interop plugins and before its metrics instrumentation in each
pass (JS, dts, declarations, looseFiles).

### 6.1 Rolldown plugin shape & implementation risks

Verified against the rolldown plugin API (<https://rolldown.rs/apis/plugin-api>).

- **Shape.** A factory returning `{ name, resolveId, load, ... }`. `Plugin` type
  imports from **`rolldown`** (same as `@savvy-web/tsdown-plugins`). Hooks may be
  async (return a Promise). `resolveId`/`load` use `first` resolution — our hook
  wins by returning non-null.
- **Virtual modules.** `resolveId(source)` intercepts each of the two specifiers
  and returns the **`\0`-prefixed** id (e.g. `\0rolldown-pnpm-config/virtual/pnpmfile`)
  so no other plugin touches it; `load(id)` returns the generated source for that
  id. Standard virtual-module pattern.
- **RISK — memoize across passes.** The bundler invokes the plugin across **four
  separate `build()` passes** (JS, dts, declarations, each looseFiles). The Effect
  validate → freeze → manifest work must run **once** and be cached (compute lazily
  on first need and memoize the result/Promise on the plugin closure), not per
  pass. `resolveId`/`load` must be pure/idempotent over that cached result.
- **RISK — dual resolution.** Each specifier must resolve **two** ways: to the
  shipped ambient `.d.ts` for `tsgo --noEmit` (type-check), and to the plugin's
  virtual source for the bundle. The package `exports`/ambient `declare module`
  provides the former; the plugin's `resolveId` intercepts for the latter.
- **RISK — isolated declarations.** The bundler's dts pass runs the plugin too and
  is expected to enforce isolated declarations. The generated virtual modules must
  therefore carry **explicit export type annotations**, e.g.
  `export const hooks: PnpmHooks = createHooks(...)` and
  `export const catalogs: Map<string, Map<string, string>> = new Map([...])` —
  otherwise dts generation fails. Confirm during implementation whether the plugin
  should emit identical typed source for the dts pass or defer that pass to the
  ambient `.d.ts`.

---

## 7. Runtime shim (subsystem 3, shipped)

`createHooks(base, manifest, refs)` → `{ updateConfig }`, **zero deps**:

- Builds the strategy table (built-ins by name + injected `refs` for custom /
  `refine`).
- `updateConfig(config)`:
  1. Build `ctx` — resolve consumer root via `rootProjectManifest` →
     `package.json` fallback (port `resolveRootName`,
     `update-config.ts:111-126`).
  2. For each manifest field: run the strategy against `base[field]` and
     `config[field]`; apply any `refine`; accumulate warnings/security.
  3. Print accumulated warnings/security using Silk's formatters (port
     `warnings.ts` / `security-warnings.ts`).
  4. An `enforcement: "error"` violation **throws**.
- The whole thing is wrapped in the existing try/catch → fall back to local
  config guard (port `pnpmfile.ts:30-42`).
- Spread merged settings only when they carry content (port the
  `Object.keys(...).length > 0 ? {...} : {}` discipline,
  `update-config.ts:206-234`) so emitted config stays lean.

---

## 8. Proof: Silk re-implemented (Phase 1 acceptance gate)

Re-express Silk as a `silk.config.ts` on top of this library and emit its
`pnpmfile.mjs`/`.cjs`. The emitted artifact must produce **byte-identical merge
behavior** to today's Silk, verified by porting Silk's existing integration
snapshots to run against the new artifact. If a snapshot diverges, the **library
is wrong, not the snapshot**.

This can be done either inside the Silk repo (consuming a published/linked
`rolldown-pnpm-config`) or as a fixture within this repo. Recommended for Phase 1:
a fixture in this repo that mirrors Silk's config + snapshots, so the proof lives
with the library and does not block on a Silk release. A follow-up task migrates
the real Silk repo.

---

## 9. Testing

Mirror Silk's setup: Vitest, **forks** pool (Effect-TS compatibility), projects
for `unit` / `int` (this scaffold also has an `e2e` dir).

- **Strategy unit tests** — port `__test__/hooks/*` from Silk; each built-in
  strategy is the pure function those tests already target.
- **Plugin/emit integration** — drive `PnpmConfigPlugin` over a fixture config
  and snapshot **both** emitted virtual modules: `.../virtual/pnpmfile`
  (`base` + manifest + refs) and `.../virtual/catalogs` (the `Map` literal). The
  `example/` package is the end-to-end build fixture: build it and assert the
  emitted `pnpmfile.mjs`/`.cjs` **and** the `.` entry's `catalogs` Map shape.
- **Catalogs export** — assert `import { catalogs } from <example>` yields a
  `Map<string, Map<string, string>>` with the expected named catalogs (incl. the
  auto-derived `*Peers`).
- **Runtime integration** — feed a synthetic consumer config through
  `createHooks`; assert merged output + captured warnings (capture, don't print,
  in tests).
- **Zero-dep guard** — a test asserting the `/runtime` entry's bundled output
  imports nothing external (no `effect`, etc.).
- **Virtual type decls** — `tsgo --noEmit` over `example/` passes (the shipped
  ambient `.d.ts` resolve both virtual specifiers).
- **Silk parity** — §8's ported snapshots.

---

## 10. Source extraction map (Silk → library)

All paths under `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk`:

| Silk source | Becomes |
| --- | --- |
| `src/hooks/merge-scalar.ts` | `scalar` built-in |
| `src/hooks/merge-map.ts` | `mapChildWins` built-in |
| `src/hooks/merge-arrays.ts` (`mergeStringArrays`, `mergeArrayRecord`) | `arrayUnion`, `arrayRecordUnion` |
| `src/hooks/merge-catalogs.ts` | `catalog` built-in |
| `src/hooks/merge-overrides.ts` | `overrides` built-in |
| `src/hooks/merge-peer-dependency-rules.ts` | `peerDependencyRules` built-in |
| `src/hooks/security-warnings.ts` | runtime security-detection module |
| `src/hooks/warnings.ts` | runtime warning/security formatters |
| `src/hooks/update-config.ts` | split: orchestration → runtime `createHooks`; `resolveRootName` → ctx helper; `WORKSPACE_LOCAL_HOISTS_BY_REPO` → Silk's `refine` on `publicHoistPattern` |
| `src/pnpmfile.ts` | runtime hooks wrapper + try/catch guard |
| `src/catalogs/types.ts` | field type definitions / registry types |
| `src/generate/generate-catalogs.ts` | determinism discipline (`sortKeys`, timestamp-strip change detection) for the emit step |

---

## 11. Open decisions for the planning phase

Resolved since first draft: **config wiring** (passed to `PnpmConfigPlugin(...)`
in the build file — §3.1) and the **bundler `plugins` passthrough + ordering**
(shipped in `@savvy-web/bundler@0.11.0` — §2). Remaining:

1. **Peer-widening default for Phase 1** — pick a simple documented rule (e.g.
   `lock-to-minor`: `^X.Y.Z` → `>=X.Y.Z <X+1`) and leave the seam for Phase 2.
2. **Where the Silk proof lives** — fixture-in-this-repo (the scaffolded
   `example/` is the natural home) vs. wiring the real Silk repo. Decide in the
   plan.
3. **Publish scope** — the library package is named `rolldown-pnpm-config`
   (unscoped) today. Confirm whether it publishes unscoped or under a scope before
   publish config is set.
4. **Manifest serialization format** — inline TS literal (Silk's current
   approach) vs. JSON. Recommend inline so custom/`refine` functions and data emit
   through one coherent virtual module.
5. **`catalogs` Map ordering** — confirm whether the emitted `Map` preserves
   declaration order or sorts keys (the determinism discipline argues for a fixed,
   sorted order; a Map preserves insertion order, so emit entries pre-sorted).

---

## 12. References

- Silk repo (extraction source, behavioral oracle): `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk`
- Silk design doc: `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/.claude/design/pnpm-plugin-silk/catalog-management.md`
- pnpm config dependencies: <https://pnpm.io/config-dependencies>
- pnpm pnpmfile / hooks: <https://pnpm.io/pnpmfile>

---

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>
