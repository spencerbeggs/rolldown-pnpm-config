# rolldown-pnpm-config — Phase 1, Milestone 3 (Silk Parity) Design

- **Status:** Implemented & shipped on `feat/m3-silk-parity`. **M3 + Phase 1 complete** — the M2 engine is proven Silk-equivalent by a differential merge-parity battery against Silk's own published pnpmfile (`package/__test__/parity/parity.int.test.ts`). All three M2 §2.4 divergences verified parity-neutral (§4).
- **Date:** 2026-06-25
- **Repo:** `/Users/spencer/workspaces/spencerbeggs/rolldown-pnpm-config`
- **Builds on:** M2 (the full strategy engine, shipped on `feat/m2-strategy-engine`). See `.claude/design/rolldown-pnpm-config/phase1-m2-design.md` — especially §2.4 (as-built divergences), §10 (resolved decisions), §11 (public API surface).
- **Behavioral oracle:** `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk` — its `pnpm-workspace.yaml` (the config to reproduce), its `src/hooks/` (the merge behavior), and its `__test__/integration/pnpmfile.int.test.ts` (the parity snapshots to port).

---

## 1. Scope

M3 proves the M2 engine is a faithful replacement for Silk: re-express Silk's **entire** `pnpm-workspace.yaml` as a `silk.config.ts` on top of the library, build it to a pnpmfile, and prove the emitted `hooks.updateConfig` produces **the same merged pnpm config as Silk's own pnpmfile** across a battery of consumer-config inputs. This completes Phase 1.

**In scope (M3):**

- A faithful `silk.config.ts` transcription of Silk's `pnpm-workspace.yaml` (both catalogs, all 14 fields, the `excludeByRepo` hoist data) using the M2 `definePlugin`/`defineCatalogs` API.
- A **differential parity harness**: feed identical consumer configs to both the newly-emitted pnpmfile and Silk's published pnpmfile; assert identical merged output.
- Porting Silk's `__test__/integration/pnpmfile.int.test.ts` snapshot cases.
- Reconciling the three documented as-built divergences (M2 §2.4) explicitly — each either accepted (with rationale) or fixed.

**Out of scope / deferred (post-Phase-1, see §8):**

- Peer-range widening, arbitrary code injection (deferred since M2).
- Phase 2 (CLI version resolver), Phase 3 (full ~100-field pnpm-schema coverage).
- Publishing the package (metadata, ambient virtual types for external consumers — M1/M2 carry-forward).

---

## 2. Parity definition (what "byte-identical" means here)

Parity is asserted on the **merged pnpm config** the hook returns — the functional contract — NOT on incidental console output.

- **Strict parity (the gate):** for every input config in the battery, `newHooks.updateConfig(input)` deep-equals `silkHooks.updateConfig(input)` for all merged fields (catalogs, overrides, publicHoistPattern, allowBuilds, the security scalars, packageExtensions, allowedDeprecatedVersions, supportedArchitectures, auditConfig, peerDependencyRules, confirmModulesPurge, minimumReleaseAgeExclude). This is the M3 acceptance gate.
- **Best-effort parity (not the gate):** the console warning **boxes**. The three M2 §2.4 divergences are intentional and live only in warning *text/robustness*, not in merged output. M3 asserts the *presence and kind* of warnings (an override box fires when catalogs diverge; a security box fires when a flag loosens), not their exact bytes.

This split is the key M3 decision: **functional behavior must match Silk exactly; cosmetic warning text may differ where M2 deliberately improved it.**

---

## 3. The `silk.config.ts` (faithful transcription)

A new `silk.config.ts` (location decided in §6) declares the full Silk config via the M2 API. Source of truth: `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/pnpm-workspace.yaml` (transcribe verbatim; do not hand-edit values).

Field-by-field mapping (Silk yaml key → M2 `definePlugin` field):

| Silk `pnpm-workspace.yaml` | M2 field | Notes |
| --- | --- | --- |
| `catalogs.silk`, `catalogs.silkPeers` | `defineCatalogs([{ name: "silk", packages }, { name: "silkPeers", packages }])` | both explicit; silkPeers is hand-authored (NOT `peers: true`) per M2 §2.1 |
| `overrides` | `overrides` | |
| `publicHoistPattern` | `publicHoistPattern: { value, excludeByRepo }` | `excludeByRepo` = `WORKSPACE_LOCAL_HOISTS_BY_REPO` from `update-config.ts:99-102`, transcribed as `{ "savvy-web-systems": ["@savvy-web/cli","@savvy-web/mcp"], "vitest-agent": ["@vitest-agent/cli","@vitest-agent/mcp"] }` |
| `allowBuilds` | `allowBuilds` | 7 packages, all `true` |
| `allowedDeprecatedVersions` | `allowedDeprecatedVersions` | glob/inflight/prebuild-install |
| `strictDepBuilds` (Silk default `true`) | `strictDepBuilds` | NOTE: Silk's `strictDepBuilds`/`blockExoticSubdeps` may live in `src/catalogs/generated.ts` (the silk* defaults) rather than the yaml; the oracle is the *emitted* `silkCatalogs`. Read `src/catalogs/generated.ts` for the canonical silk-managed values of every field. |
| `blockExoticSubdeps: true` | `blockExoticSubdeps` | |
| `minimumReleaseAge: 1440` | `minimumReleaseAge` | |
| `minimumReleaseAgeExclude: ["@savvy-web/*"]` | `minimumReleaseAgeExclude` | |
| `packageExtensions` | `packageExtensions` | (from generated.ts if present) |
| `supportedArchitectures` | `supportedArchitectures` | |
| `auditConfig` | `auditConfig` | |
| `peerDependencyRules` | `peerDependencyRules` | allowedVersions/ignoreMissing/allowAny |
| `confirmModulesPurge: false` | `confirmModulesPurge` | |

**Canonical silk-managed values:** Silk's *runtime* values are whatever `src/catalogs/generated.ts` (`silkCatalogs` + `silkPeerDependencyRules`) holds — that is what Silk's pnpmfile actually merges. The `silk.config.ts` must reproduce **those** values, not just the raw yaml (the two should agree, but `generated.ts` is authoritative). The planning step reads `generated.ts` and transcribes every `silk*` field.

All default enforcements come from the M2 registry (catalogs/overrides/peerRules/security fields → `warn`; the rest → `absent`), matching Silk. No per-field `enforcement` overrides are needed for parity (Silk has no `error` path).

---

## 4. Reconciling the three M2 §2.4 divergences

1. **`securityFlag` generic detail string.** Affects only the security-box *text* (`detail`), not merged output. → **Accept.** Best-effort warning parity (§2) asserts a security box fires; it does not byte-compare the detail line. Document in the parity test.
2. **`excludeByRepo` runs on the merged hoist list (exclude-wins).** Could affect merged `publicHoistPattern`. → **Verify parity-neutral for Silk's real data, then accept.** Silk's consuming repos (`savvy-web-systems`, `vitest-agent`) never *re-add* an excluded package locally, so exclude-after-merge and Silk's filter-before-merge produce identical results for the real `WORKSPACE_LOCAL_HOISTS` data. The parity battery MUST include an input simulating each source repo (`rootProjectManifest.name`) to prove the merged hoist list matches Silk. If a constructed input that re-adds an excluded package is added, it is expected to differ — exclude that adversarial case from the strict gate and note it.
3. **Override box `Math.max(0, …)` width guard.** Affects only override-box rendering robustness (prevents a `RangeError` on long setting paths), never merged output. → **Accept** (strictly more robust than Silk). Covered by the existing `warnings.test.ts` regression; not part of merged-config parity.

None of the three breaks the strict merged-config gate for Silk's real configuration. M3 documents them as the deliberate, accepted deltas between the library and the Silk oracle.

**Resolution (as-verified in M3):** all three confirmed parity-neutral and **accepted** — none required an engine change.

1. **`securityFlag` generic detail** — verified warning-text-only. The differential gate silences `console.warn` and compares merged output; the security-box *presence* test (`warnings-parity.int.test.ts` — the case that loosens `strictDepBuilds`) passes against our generic detail. No merged-output impact. **Accepted.**
2. **`excludeByRepo` exclude-wins** — verified parity-neutral for Silk's real data. The differential battery includes both source-repo simulations (`rootProjectManifest.name` = `savvy-web-systems` and `vitest-agent`); both deep-equal Silk's pnpmfile output, because neither consuming repo re-adds an excluded hoist locally (exclude-after-merge ≡ Silk's filter-before-merge for this data). No adversarial re-add input was added to the gate (none is part of Silk's real config). **Accepted.**
3. **Override-box `Math.max(0, …)` width guard** — verified warning-robustness-only; never touches merged output. The override-box *presence* test passes. **Accepted** (strictly more robust than the Silk oracle).

**Acceptance evidence:** differential battery 11/11 deep-equal Silk's real pnpmfile (`parity.int.test.ts`, 9 base inputs + 2 ported from Silk's `__test__/integration/pnpmfile.int.test.ts`); base-transcription parity (`base-parity.int.test.ts`) against Silk's live `silkCatalogs`/`silkPeerDependencyRules`; warning-presence parity (`warnings-parity.int.test.ts`). Full suite 64/64, build dev+prod green, API Extractor errors 0 / warnings 0.

> **Known local-only gate (decision):** the parity `*.int.test.ts` suite is a *differential* test that loads Silk's built artifacts (`dist/dev/pkg/pnpmfile.cjs` + `catalogs/generated.js`) from the sibling repo at an absolute path. The differential cases skip gracefully when that repo is absent, but `base-parity` and the `oracle is present` guard depend on it being checked out and built — so the parity suite is intended to run **locally** (where the Silk repo lives), not in a bare CI checkout. This matches the self-contained-in-rolldown design choice (§6); a graceful CI skip was deliberately not added (Phase 1 is ending). Re-run locally with the sibling Silk repo built (`pnpm -C <silk> run build`).

---

## 5. Differential parity harness (the proof)

The strongest proof is differential testing against Silk's actual artifact, not re-snapshotting.

1. **Build** `silk.config.ts` to a pnpmfile (via the bundler, as the example does) → `silkHooks = (emitted).hooks`.
2. **Import** Silk's published/built pnpmfile → `silkOracleHooks = require("<silk>/dist/npm/pnpmfile.cjs").hooks` (or `dist/dev`). (Confirm Silk's pnpmfile output path during planning; build Silk if needed.)
3. **Battery** of consumer-config inputs `INPUTS` (each a plain `PnpmConfig`), e.g.:
   - empty `{}` (pure Silk defaults injected),
   - local catalog override (`catalogs.silk.typescript` differs),
   - local override of a security flag (`strictDepBuilds: false`) and `minimumReleaseAge` lowered,
   - local `allowBuilds` enabling a blocked build,
   - local arrays/maps (`publicHoistPattern`, `packageExtensions`) to exercise union/child-wins,
   - source-repo simulation: `{ rootProjectManifest: { name: "savvy-web-systems" }, ... }` for the hoist `excludeByRepo` path,
   - local `peerDependencyRules` additions.
4. **Assert** for each input: `clone(input) → newHooks.updateConfig` deep-equals `clone(input) → silkOracleHooks.updateConfig`, comparing every merged field. `console.warn` is captured (silenced) during the comparison.
5. **Warning presence** (best-effort): assert the override/security boxes fire for the diverging inputs (substring match on captured `console.warn`, not exact bytes).

This catches any merge-semantics drift between the M2 engine and Silk immediately and exactly, with no hand-maintained golden file.

**Supplementary:** port the specific cases from Silk's `__test__/integration/pnpmfile.int.test.ts` as additional battery inputs (they encode Silk's intended scenarios).

---

## 6. Where the proof lives (decision)

**Recommendation: a dedicated parity fixture + test inside `package/__test__/parity/`, with `silk.config.ts` as a test fixture — NOT the `example/` package and NOT wiring the real Silk repo as a workspace dependency.**

- The `silk.config.ts` lives at `package/__test__/parity/silk.config.ts` (a fixture).
- A parity build step (a small script or a vitest `beforeAll`) builds it to a temp pnpmfile, OR — simpler and avoiding a full bundler run in tests — the parity test imports `definePlugin`+`freeze` directly, runs `freeze(silkConfig)` to get `{ base, manifest }`, calls `createHooks(base, manifest)`, and diffs against Silk's oracle. This tests the real engine path without a bundler invocation. (The full emit→bundle path is already covered by the example e2e from M1/M2; M3 parity targets the merge semantics.)
- Silk's oracle pnpmfile is imported from its built `dist`. The planning step pins the exact path and adds a guard that builds Silk if the artifact is missing.

Rationale: keeps M3 self-contained in the rolldown repo (no cross-repo workspace coupling), fast (no bundler run per test), and exact (differential against Silk's real hooks).

Alternative (heavier, deferred): wire the real Silk repo to consume the published `rolldown-pnpm-config` and run Silk's own test suite against it — a true end-to-end swap. Valuable as a pre-cutover check but not needed to prove merge parity; note as a follow-up.

---

## 7. Testing

- **Parity battery** (`package/__test__/parity/parity.int.test.ts`) — §5, the M3 gate.
- **Config transcription test** — assert `freeze(silkConfig).base` reproduces every `silk*` value from Silk's `generated.ts` (catches transcription drift in `silk.config.ts` independently of the merge harness).
- **Source-repo hoist test** — the `excludeByRepo` case for both Silk source repos, asserting merged `publicHoistPattern` matches Silk.
- **Warning-presence tests** — override/security boxes fire for the diverging inputs.
- Existing M1/M2 suites stay green; runtime stays zero-dep.

---

## 8. Roadmap after M3 ("anything after")

M3 completes **Phase 1** (the Silk-equivalent engine, proven). The original `phase1-design.md` §2 roadmap continues:

- **Phase 2 — CLI version resolver.** A `rolldown-pnpm-config` CLI (the bin scaffolded in `package/src/cli/`) that queries the registry, resolves latest compatible versions honoring peer constraints, and rewrites the `defineCatalogs` source. **Check the existing `effect-catalog-resolver` skill first** — its description already covers npm discovery + peer-constraint resolution + rewriting; much of the resolution logic may exist. Needs its own brainstorm → spec → plan.
- **Phase 3 — Full pnpm-schema coverage.** Grow `FIELD_REGISTRY` + `definePlugin` toward all ~100 `pnpm-workspace` fields. Purely additive on the M2 engine (each new field = a registry entry + a strategy, mostly reusing the existing built-ins). The hybrid escape hatch (`strategies.*`) already covers unknown fields in the interim. Needs its own spec when a consumer wants fields beyond Silk's set.
- **Pre-publish hardening** (cross-cutting, before any release): ship library-owned ambient virtual-module types for external consumers; real `package/package.json` publish metadata (description/version, drop `private`); peer-widening if a non-Silk plugin wants derived peers.

Each of these is a separate spec → plan → implementation cycle; none is M3.

---

## 9. Open decisions for planning

1. **Silk oracle artifact path** — `dist/npm/pnpmfile.cjs` vs `dist/dev/...`; and whether to build Silk in a test `beforeAll` if missing. Pin in the plan.
2. **Transcription source** — confirm `src/catalogs/generated.ts` (`silkCatalogs`) is the authoritative silk-managed value set (it is what Silk's pnpmfile merges); transcribe from it, cross-checking the yaml.
3. **Adversarial hoist input** — whether to include the exclude-wins divergence case (§4.2) as an explicitly-documented expected-difference, or omit it from the battery. Recommend include + document.

---

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>
