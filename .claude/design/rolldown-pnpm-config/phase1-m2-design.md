# rolldown-pnpm-config — Phase 1, Milestone 2 (Strategy Engine) Design

- **Status:** Implemented and shipped on `feat/m2-strategy-engine` (`0601814..205519c`, 11 commits ahead of `main`). This doc is the as-built record; deviations from the original plan are called out inline (see §2.4, §10, §11).
- **Date:** 2026-06-25
- **Repo:** `/Users/spencer/workspaces/spencerbeggs/rolldown-pnpm-config` (branch `feat/m2-strategy-engine`)
- **Implementation plan:** `.claude/design/rolldown-pnpm-config/phase1-m2-plan.md` (now stamped completed; its task outcomes are folded into this doc).
- **Builds on:** M1 — the catalogs-only walking skeleton (on `main` as `f84d826` "feat: extract core from @savvy-web/silk").
- **Parent design:** `.claude/design/rolldown-pnpm-config/phase1-design.md` (§5 strategy engine, §10 Silk source map). This doc refines that with the M2-specific decisions and the empirical findings below; where the parent's §5 sketch and this doc disagree, the as-built contract in §4 here wins.
- **Behavioral oracle (port source):** `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/src/hooks/`

---

## 1. Scope

M2 generalizes M1's catalogs-only engine into the **full merge engine** for every pnpm field Silk manages, with per-field enforcement, override warnings, and security-loosening detection — all ported from Silk's pure merge functions into the zero-dependency runtime.

**In scope (M2):**

- The strategy engine: `Strategy` signature with detection (`divergences`) separated from response (`enforcement`), a field registry, the field→strategy manifest, and multi-field `freeze`/`createHooks` (generalized from catalogs-only).
- All built-in strategies (table in §5) ported 1:1 from Silk's merge functions.
- Unified enforcement `warn | error | absent` (including the `error`/throw path — a capability beyond Silk).
- Override-warning + security-warning detection and the two console boxes (ported verbatim from Silk's `warnings.ts`).
- `ctx` (consumer-root resolution) + a **data-driven** `excludeByRepo` refine for `publicHoistPattern` (Silk's `WORKSPACE_LOCAL_HOISTS_BY_REPO`).
- The remaining ~12 fields wired through `definePlugin`/`freeze`/registry; the `example/` config exercises them.

**Explicitly deferred (NOT M2):**

- **Peer-range widening / derivation** — see §3. Silk's `silkPeers` is hand-authored and not derivable; parity uses an explicit `silkPeers` catalog. Auto-widening is a future convenience nobody needs yet.
- **Arbitrary custom-strategy / `refine` *functions* injected as code** — see §4. Silk needs only data-driven config; arbitrary code injection is a documented, unbuilt seam.
- **Full Silk parity snapshots** — that is **M3**. M2's gate is the engine + all strategies working, unit- and runtime-integration-tested, with the example exercising every field.

---

## 2. Key findings from this brainstorm (these drove the decisions)

### 2.1 Silk's `silkPeers` is NOT mechanically derivable

Comparing all 48 packages in Silk's `silk` vs `silkPeers` catalogs: 14 fit no uniform widening rule. The `>=` vs `^` choice and the floor are per-package hand-authored decisions:

```text
effect:           silk ^3.21.4   → peers >=3.21.0   (>=, floor zeroed)
@types/node:      silk ^26.0.0   → peers ^26.0.0    (caret KEPT)
@types/react:     silk ^19.2.17  → peers ^19.2.0    (caret kept, floor zeroed)
@effect/platform: silk ^0.96.2   → peers >=0.96.0   (>=, floor zeroed)
```

→ **Decision:** defer auto-widening; reproduce `silkPeers` for parity by declaring it as an explicit independent catalog (M1's `defineCatalogs` already accepts multiple named catalogs).

### 2.2 Silk's enforcement is child-wins + three warning behaviors, no throw

Every Silk field is child-wins. The only variation is which warning fires: override-box (catalogs/overrides/peerRules — on *any* per-key difference), security-box (the security fields — *only* on loosening, directional), or silent (maps/arrays/`confirmModulesPurge`). Silk has no `error`/throw path.

→ **Decision (user):** build the **unified** `warn | error | absent` model now, with detection (strategy) separated from response (enforcement). Silk's defaults map every field to its current warn/silent behavior, so parity holds; `error` is the new capability.

### 2.3 Silk's only install-time-conditional logic is data, not code

`WORKSPACE_LOCAL_HOISTS_BY_REPO` (`update-config.ts:99-102`) is a `{ repo: ReadonlySet<package> }` map filtering `publicHoistPattern` by the consuming repo (`resolveRootName`).

→ **Decision:** model it as a **data-driven built-in `excludeByRepo` refine**, not an injected closure. Arbitrary `refine`/custom-strategy functions are deferred (YAGNI).

### 2.4 As-built decisions and intentional divergences from Silk (M3 reconciliation)

Recorded here so M3's parity work knows where the shipped engine deliberately differs from the Silk oracle, and where a plan-level classification was superseded.

1. **`securityFlag` divergence detail is generic.** The shipped detector emits a field-agnostic `detail` ("Disables a security check that Silk enabled.") rather than embedding the field name like Silk's `detectFlagLoosening`. This is forced by the field-agnostic strategy table: `securityFlag`/`securityMin` emit `setting: ""` and the runtime fills the field name when collecting (see `createHooks` in `package/src/runtime/index.ts`). The field name still surfaces to the user via `setting` in the printed security box. M3 parity snapshots must expect the generic detail string. See `package/src/runtime/strategies/scalar.ts`.
2. **`excludeByRepo` runs on the merged hoist list (exclude-wins).** Silk filters its base hoist list first then unions, so a child can re-add an excluded package; the shipped refine runs after `arrayUnion` on the already-merged list, so exclude always wins. Defensible for the use case, flagged for M3 parity. See `excludeByRepo` in `package/src/runtime/ctx.ts` and its application in `package/src/runtime/index.ts`.
3. **Override box width guard — resolved (intentional divergence from the verbatim Silk port).** The override box was originally ported verbatim from Silk, which pads with a bare `WARNING_BOX_WIDTH - len`; a `setting` path longer than ~71 chars (e.g. a scoped override like `catalogs.production.@org/<long-package>`) threw `RangeError` on the warning path, turning a soft warning into a hard install failure. Resolved in PR review: `formatOverrideWarning` now uses the same `Math.max(0, …)` floor the security box already had, so the box renders for any path length. This makes the override box strictly more robust than the Silk oracle — M3 parity snapshots should expect the guarded form. Regression test: `package/__test__/runtime/warnings.test.ts`. See `package/src/runtime/warnings.ts`.

These reconcile against, but do not yet reach, **full Silk-config parity snapshots — that remains M3** (alongside peer-range widening and arbitrary code injection, both deferred by §1).

---

## 3. Peers (deferred — for the record)

`defineCatalogs` already supports multiple independent named catalogs (M1). Silk parity (M3) declares both `silk` and `silkPeers` as explicit catalogs, ported verbatim from Silk's `pnpm-workspace.yaml`; both flow through the `catalog` strategy identically. M1's `peers: true` pass-through copy and the `peer?: "lock-to-minor"` per-package field remain as a no-op forward-compat seam (already commented in `define-catalogs.ts`). No widening math is built in M2.

---

## 4. Strategy engine: detection + enforcement

A **strategy** is a pure function used at runtime. Detection (what differs) is separated from response (what to do):

```ts
interface Divergence {
  readonly setting: string;     // e.g. "catalogs.silk.typescript", "strictDepBuilds", "allowBuilds.esbuild"
  readonly silkValue: string;   // rendered for display
  readonly childValue: string;  // rendered for display
  readonly detail: string;      // human explanation (security strategies fill this; override strategies use a default)
  readonly kind: "override" | "security";  // selects which console box collects it
}

type Strategy<T> = (base: T | undefined, local: T | undefined, ctx: RuntimeCtx) => {
  merged: T | undefined;
  divergences: Divergence[];
};
```

- **Override strategies** emit a `kind:"override"` divergence for any per-key value difference.
- **Security strategies** emit a `kind:"security"` divergence only when the child *loosens* (directional).
- **Quiet strategies** emit none.

**Enforcement** is applied by the runtime *after* a strategy runs, per the field's manifest entry:

- `absent` → use `merged` silently.
- `warn` → use `merged`; route each divergence to its box (`kind`).
- `error` → if `divergences.length > 0`, **throw** (a tagged install-time error naming the field + divergences) instead of using `merged`.

For quiet strategies (no divergences) `warn`/`error` are inert — they behave as `absent`. This is correct: there is nothing to warn or fail on.

**Field registry:** `Record<field, { strategy, defaultEnforcement, ... }>`. Defaults reproduce Silk (§5 table). `definePlugin` resolves each declared field: bare value → registry default; `{ value, enforcement }` → overridden enforcement; `strategies.*(value, opts)` → explicit strategy (the hybrid escape hatch for unknown fields). Unknown fields MUST be wrapped (type error otherwise).

---

## 5. Built-in strategy table (Silk source → strategy)

| Strategy | Merge (Silk source) | Detector (Silk source) → box | Fields · default enforcement |
| --- | --- | --- | --- |
| `catalog` | child-wins/key (`merge-catalogs.ts mergeSingleCatalog`) | any per-key diff → override | `catalogs.*` (incl. silk, silkPeers) · `warn` |
| `overrides` | child-wins/key (`merge-overrides.ts`) | any per-key diff → override | `overrides` · `warn` |
| `peerDependencyRules` | composite: allowedVersions=`catalog`, ignoreMissing/allowAny=`arrayUnion` (`merge-peer-dependency-rules.ts`) | allowedVersions diff → override | `peerDependencyRules` · `warn` |
| `mapChildWins` | `{...silk, ...child}` (`merge-map.ts`) | none | `packageExtensions`, `allowedDeprecatedVersions` · `absent` |
| `allowBuilds` | `{...silk, ...child}` | enable-what-silk-blocked (`security-warnings.ts detectAllowBuildsLoosening`) → security | `allowBuilds` · `warn` |
| `arrayUnion` | union+sort (`merge-arrays.ts mergeStringArrays`) | none | `publicHoistPattern`, `minimumReleaseAgeExclude` · `absent` |
| `arrayRecordUnion` | per-axis union (`merge-arrays.ts mergeArrayRecord`) | none | `supportedArchitectures`, `auditConfig` · `absent` |
| `scalar` | `child ?? silk` (`merge-scalar.ts`) | none | `confirmModulesPurge` · `absent` |
| `securityFlag` | `child ?? silk` | flag disabled (`detectFlagLoosening`) → security | `strictDepBuilds`, `blockExoticSubdeps` · `warn` |
| `securityMin` | `child ?? silk` | value lowered (`detectMinReleaseAgeLoosening`) → security | `minimumReleaseAge` · `warn` |

Notes:

- M1's `catalog` merge (catalogs-only `createHooks`) is **upgraded** to emit override divergences.
- `publicHoistPattern` additionally carries the `excludeByRepo` refine (§2.3), applied after `arrayUnion`.
- The two console boxes (`formatOverrideWarning`, `formatSecurityWarning`) are ported **verbatim** from `warnings.ts` (75-char ASCII boxes) into the runtime.

---

## 6. Engine generalization (the spike) & emit

**Build time (`freeze`, Effect — the only Effect):** validates each declared field (per-field Schema) and emits two plain-data structures:

- `base` — `Record<field, frozenValue>`.
- `manifest` — `Record<field, { strategy: "<name>", enforcement, options? }>` (e.g. `excludeByRepo` data for `publicHoistPattern`).

**Runtime (`createHooks(base, manifest)` → `{ updateConfig }`, zero-dep):** builds the strategy table (built-ins by name) and the two box formatters. `updateConfig(config)`:

1. Build `ctx` (consumer root name/dir — port `resolveRootName`, `update-config.ts:111-126`).
2. For each manifest field: `strategy(base[field], config[field], ctx)` → `{ merged, divergences }`; apply the field's refine; apply enforcement (silent / collect-by-box / throw).
3. Print collected override-box then security-box divergences (the two `format*Warning` ports).
4. Return merged config, spreading each field only when it carries content (port `update-config.ts:206-234`). Wrap in the try/catch → fall-back-to-local guard (port `pnpmfile.ts:30-42`) — except an `error`-enforcement throw must propagate (fail the install), so the guard distinguishes the tagged enforcement error from incidental failures.

**Emit (plain-JS, the M1-settled branch):** `import { createHooks } from "rolldown-pnpm-config/runtime"; export const hooks = createHooks(BASE, MANIFEST);` with `BASE`/`MANIFEST` as deterministically-sorted plain-data literals. The `catalogs` virtual module is unchanged from M1.

**Spike (task 1):** generalize freeze/manifest/runtime + the `{merged,divergences}` strategy signature + enforcement application + the registry skeleton, proven end-to-end with the engine and **one** new quiet field (`confirmModulesPurge`) — declared → frozen → manifest → runtime applies → emitted → `example/` builds green. Then strategies/fields are ported incrementally onto the proven engine.

---

## 7. Testing

Mirror M1: Vitest, tests in `package/__test__/` (`*.test.ts`), `pnpm exec vitest run`. Runtime stays zero-dep (guard test). **As-built:** the test tooling migrated from `@savvy-web/vitest` to `@vitest-agent/plugin` during M2 (see `vitest.config.ts`/`vitest.setup.ts`); the test surface and assertions are unchanged.

- **Strategy unit tests** — port Silk's `__test__/hooks/*` per strategy; each is the pure merge+detector the Silk tests already target.
- **Enforcement unit tests** — `absent` silent, `warn` collects divergences by box, `error` throws on divergence and is inert on none.
- **Box formatter tests** — exact-string snapshots of `formatOverrideWarning`/`formatSecurityWarning` (port Silk's expected output).
- **Runtime integration** — feed a synthetic consumer config (overriding catalogs, loosening a security flag, etc.) through `createHooks`; assert merged output + captured box text (capture `console.warn`, don't print) + that an `error`-enforced divergence throws.
- **refine test** — `excludeByRepo` filters `publicHoistPattern` for the matching consumer root and passes through otherwise.
- **Emit/example** — `example/` config exercises every field; build dev+prod green; the emitted pnpmfile applies the merges (extend M1's e2e).

Silk parity snapshots are **M3**.

---

## 8. Source extraction map (Silk → M2)

All paths under `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk`:

| Silk source | Becomes (M2) |
| --- | --- |
| `src/hooks/merge-scalar.ts` | `scalar` / `securityFlag` / `securityMin` merge |
| `src/hooks/merge-map.ts` | `mapChildWins` / `allowBuilds` merge |
| `src/hooks/merge-arrays.ts` | `arrayUnion`, `arrayRecordUnion` |
| `src/hooks/merge-catalogs.ts` | `catalog` (upgrade M1's merge to add detection) |
| `src/hooks/merge-overrides.ts` | `overrides` |
| `src/hooks/merge-peer-dependency-rules.ts` | `peerDependencyRules` (composite) |
| `src/hooks/security-warnings.ts` | the three `kind:"security"` detectors |
| `src/hooks/warnings.ts` | the two box formatters + the divergence-collection model |
| `src/hooks/update-config.ts` | runtime `updateConfig` orchestration; `resolveRootName` → ctx; `WORKSPACE_LOCAL_HOISTS_BY_REPO` → `excludeByRepo` refine data; the spread-when-non-empty discipline |
| `src/pnpmfile.ts` | the try/catch guard (distinguishing the enforcement-error throw) |
| `src/catalogs/types.ts` | per-field type definitions / registry types |

---

## 9. M1 carry-forward (relevant to M2)

From M1's final review (do not silently re-break these; fix opportunistically only if M2 touches them):

1. ~~Non-fatal `ae-wrong-input-file-type` on the `./runtime` export.~~ **Resolved in M2.** The prod build's API Extractor pass is clean: `package/dist/prod/issues.json` reports `errors 0 / ciFatal 0 / warnings 0`.
2. Library-owned ambient virtual-module types for external consumers — still pre-publish, not addressed in M2.
3. `package/package.json` publish metadata — still pre-publish, not addressed in M2.

---

## 10. Decisions (resolved as-built)

These were the open planning decisions; M2 resolved them as follows.

1. **Strategy file layout** — grouped by kind, not one file per strategy: `strategies/scalar.ts` (scalar/securityFlag/securityMin), `strategies/maps.ts` (mapChildWins/allowBuilds), `strategies/arrays.ts` (arrayUnion/arrayRecordUnion), `strategies/catalogs.ts` (the catalogs field strategy), `strategies/overrides.ts` (overrides/peerDependencyRules), with `strategies/table.ts` keying them by manifest name.
2. **`error` throw shape** — `EnforcementError` is a **plain `Error` subclass** (zero-dep runtime, NOT a `Data.TaggedError`), thrown from `applyEnforcement` (`package/src/runtime/enforcement.ts`) and identified by `name === "EnforcementError"`. The message names the field and lists the diverging `setting`s. `createHooks` deliberately has no swallow-guard so the throw fails the install (documented in the `@remarks` on `createHooks`).
3. **`ctx` construction cost** — `ctx = { rootName: resolveRootName(config) }` is built once per `updateConfig` call. The current build resolves `rootName` unconditionally rather than lazily-only-if-a-field-has-a-refine; acceptable for M2's field set (a single `package.json` read).
4. **Manifest enforcement representation** — inline per-field in the emitted `manifest` literal (`{ strategy, enforcement, options? }`), serialized with recursively sorted keys via M1's `sortKeys`. Refine data (`excludeByRepo`) rides in `options`.

## 11. Public API surface (release tags, as-built)

Resolved during M2's API Extractor pass. **This supersedes the plan's Task 8 classification**, which listed `Enforcement`, `ManifestEntry`, `Manifest` and `Base` as `@internal`. Because `createHooks(base, manifest)` is `@public`, its parameter and manifest-entry types had to be promoted to `@public` to avoid an `ae-forgotten-export` leak.

- **`@public`:** `definePlugin`, `PluginConfig`, `FieldInput`, `defineCatalogs`, `CatalogInput`, `CatalogPackageSpec`, `CatalogsResult`, `PnpmConfigPlugin`, and the runtime `createHooks`, `PnpmConfig`, `PnpmHooks`, `Base`, `Manifest`, `ManifestEntry`, `Enforcement`.
- **`@internal`:** `Strategy`, `StrategyResult`, `Divergence`, `RuntimeCtx`, every strategy, `STRATEGY_TABLE`, `FIELD_REGISTRY`, `applyEnforcement`, `EnforcementError`, `resolveRootName`, `excludeByRepo`, the box formatters, `ConfigError`, `freeze`, `PluginDeps`, `createPnpmConfigPlugin`.

The authoritative tags live on the symbols in `package/src/**`; the prod build's API report is clean (§9 item 1).

---

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>
