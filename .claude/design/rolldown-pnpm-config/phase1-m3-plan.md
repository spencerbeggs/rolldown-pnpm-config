# rolldown-pnpm-config — Phase 1 Milestone 3 (Silk Parity) Implementation Plan

**Status:** Completed and shipped on `feat/m3-silk-parity` (2026-06-25). All tasks executed; outcomes recorded in `phase1-m3-design.md`. As-built differs from this plan in two pinned-by-planning details: the Silk oracle artifact is `dist/dev/pkg/pnpmfile.cjs` (not `dist/npm`), loaded via `createRequire`, and the battery lives in a shared `inputs.ts` (11 inputs: 9 base + 2 ported).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the M2 engine is a faithful Silk replacement — transcribe Silk's full config as a `silk.config.ts` and show the engine's merged output deep-equals Silk's own pnpmfile across a battery of consumer-config inputs (differential testing). Completes Phase 1.

**Architecture:** A fixture `silk.config.ts` (full transcription of Silk's `src/catalogs/generated.ts`) is fed through the real engine path (`freeze` → `createHooks`) and diffed, per input, against Silk's published pnpmfile `hooks.updateConfig`. No hand-maintained golden file; Silk's artifact is the oracle.

**Tech Stack:** TypeScript (ESM), Effect (build-time `freeze`), `@vitest-agent/plugin` test tooling (as-built since M2), Node ≥24.11. No bundler run needed in the parity tests (the emit→bundle path is already covered by the example e2e).

## Global Constraints

- **Package:** `rolldown-pnpm-config` (`package/`). Branch off the M2 work (`feat/m2-strategy-engine` or wherever M2 landed) into `feat/m3-silk-parity`.
- **Parity gate = merged-config deep-equality**, not warning-box bytes (M3 design §2). `console.warn` is silenced during merged comparison; box *presence* is asserted separately.
- **Three accepted divergences (M2 §2.4 / M3 design §4):** `securityFlag` generic detail, `excludeByRepo` exclude-wins, override-box width guard — all warning-text/robustness only; none breaks merged parity for Silk's real config. Do NOT "fix" them to chase byte-identical warning text.
- **Authoritative silk values:** `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/src/catalogs/generated.ts` (`silkCatalogs` + `silkPeerDependencyRules`) — what Silk's pnpmfile actually merges. Transcribe from it (cross-check `pnpm-workspace.yaml`).
- **Silk oracle artifact:** Silk's built pnpmfile (`dist/npm/pnpmfile.cjs` — confirm in Task 2). Tests `require` it by absolute path with a skip-if-missing guard + build instruction.
- **As-built M2 API:** `definePlugin(config)` (fields in `package/src/define-plugin.ts`), `defineCatalogs([{name,packages}])`, `freeze(config): Effect<{base,manifest}, ConfigError>`, `createHooks(base, manifest): { updateConfig }`. `publicHoistPattern` accepts `{ value, excludeByRepo }`.
- **Tests:** `package/__test__/` mirroring `src/`; integration cases use the `*.int.test.ts` suffix; `pnpm exec vitest run <path>` from repo root.
- **Commits:** Conventional Commits + DCO signoff `Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>`.

**Note on M2 deltas:** if any as-built M2 detail (field name, `excludeByRepo` shape, `createHooks` signature) differs from this plan, the as-built code wins — read the cited M2 file and adapt; report the delta.

---

### Task 1: Transcribe `silk.config.ts` + assert base parity

Reproduce Silk's full silk-managed value set as a config fixture, and prove the transcription is faithful — independently of the merge harness.

**Files:**

- Create: `package/__test__/parity/silk.config.ts`, `package/__test__/parity/base-parity.int.test.ts`

**Interfaces:**

- Consumes: `definePlugin`, `defineCatalogs` (`rolldown-pnpm-config`), `freeze` (`../../src/plugin/freeze.js`).
- Produces: `silkConfig` (default export of `silk.config.ts`).

- [x] **Step 1: Read the oracle values**

Read `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/src/catalogs/generated.ts` (`silkCatalogs`, `silkPeerDependencyRules`) and `pnpm-workspace.yaml`. Read `src/hooks/update-config.ts:99-102` for `WORKSPACE_LOCAL_HOISTS_BY_REPO`. These are the values to transcribe.

- [x] **Step 2: Write `silk.config.ts`**

Create `package/__test__/parity/silk.config.ts` — transcribe verbatim (do not invent values):

```ts
import { defineCatalogs, definePlugin } from "rolldown-pnpm-config";

export const silkConfig = definePlugin({
  catalogs: defineCatalogs([
    { name: "silk", packages: { /* …all silkCatalogs.silk entries… */ } },
    { name: "silkPeers", packages: { /* …all silkCatalogs.silkPeers entries… */ } },
  ]),
  overrides: { /* silkCatalogs.silkOverrides */ },
  publicHoistPattern: {
    value: [ /* silkCatalogs.silkPublicHoistPattern */ ],
    excludeByRepo: {
      "savvy-web-systems": ["@savvy-web/cli", "@savvy-web/mcp"],
      "vitest-agent": ["@vitest-agent/cli", "@vitest-agent/mcp"],
    },
  },
  allowBuilds: { /* silkCatalogs.silkAllowBuilds */ },
  allowedDeprecatedVersions: { /* silkCatalogs.silkAllowedDeprecatedVersions */ },
  packageExtensions: { /* silkCatalogs.silkPackageExtensions */ },
  supportedArchitectures: { /* silkCatalogs.silkSupportedArchitectures */ },
  auditConfig: { /* silkCatalogs.silkAuditConfig */ },
  peerDependencyRules: { /* silkPeerDependencyRules */ },
  strictDepBuilds: /* silkCatalogs.silkStrictDepBuilds */,
  blockExoticSubdeps: /* silkCatalogs.silkBlockExoticSubdeps */,
  minimumReleaseAge: /* silkCatalogs.silkMinimumReleaseAge */,
  minimumReleaseAgeExclude: [ /* silkCatalogs.silkMinimumReleaseAgeExclude */ ],
  confirmModulesPurge: /* silkCatalogs.silkConfirmModulesPurge */,
});
```

Fill every `/* … */` from the oracle. Omit a field only if Silk's `generated.ts` omits it (e.g. an empty `{}`/`[]` silk value).

- [x] **Step 3: Write the base-parity test (fails until transcription is complete/correct)**

Create `package/__test__/parity/base-parity.int.test.ts`:

```ts
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { silkConfig } from "./silk.config.js";
import { freeze } from "../../src/plugin/freeze.js";
// Import Silk's emitted values directly as the oracle:
import { silkCatalogs } from "/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/src/catalogs/generated.js";

describe("silk.config base parity", () => {
  it("freeze(silkConfig).base reproduces Silk's silk-managed values", async () => {
    const { base } = await Effect.runPromise(freeze(silkConfig));
    expect((base.catalogs as Record<string, unknown>).silk).toEqual(silkCatalogs.silk);
    expect((base.catalogs as Record<string, unknown>).silkPeers).toEqual(silkCatalogs.silkPeers);
    expect(base.overrides).toEqual(silkCatalogs.silkOverrides);
    expect(base.allowBuilds).toEqual(silkCatalogs.silkAllowBuilds);
    expect(base.minimumReleaseAge).toEqual(silkCatalogs.silkMinimumReleaseAge);
    expect(base.minimumReleaseAgeExclude).toEqual(silkCatalogs.silkMinimumReleaseAgeExclude);
    expect(base.strictDepBuilds).toEqual(silkCatalogs.silkStrictDepBuilds);
    expect(base.blockExoticSubdeps).toEqual(silkCatalogs.silkBlockExoticSubdeps);
    expect(base.confirmModulesPurge).toEqual(silkCatalogs.silkConfirmModulesPurge);
    // …extend to packageExtensions / supportedArchitectures / auditConfig / allowedDeprecatedVersions
  });
});
```

(If importing Silk's `generated.ts` by absolute path fails under the test's module resolution, fall back to transcribing the expected values inline in the test from the same oracle — but the import is preferred so the oracle stays live.)

- [x] **Step 4: Run — iterate transcription until green**

Run: `pnpm exec vitest run package/__test__/parity/base-parity.int.test.ts`
Expected: PASS once `silk.config.ts` matches the oracle exactly. Mismatches point at transcription errors — fix `silk.config.ts`, not the test.

- [x] **Step 5: Commit**

```bash
git add package/__test__/parity
git commit -m "test: transcribe Silk config + assert base parity

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 2: Differential merge-parity harness (the M3 gate)

Diff the engine's merged output against Silk's own pnpmfile across a battery of inputs.

**Files:**

- Create: `package/__test__/parity/oracle.ts` (loads Silk's hooks), `package/__test__/parity/parity.int.test.ts`

**Interfaces:**

- Consumes: `silkConfig` (Task 1); `freeze`, `createHooks`.
- Produces: the battery + the gate assertion.

- [x] **Step 1: Confirm Silk's oracle pnpmfile path + loader**

Run: `ls /Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/dist/npm/pnpmfile.cjs /Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/dist/dev/pnpmfile.cjs 2>/dev/null`
Pin whichever exists. If neither exists, the test's loader builds Silk first: `pnpm -C /Users/spencer/workspaces/savvy-web/pnpm-plugin-silk run build` (note: builds the oracle once).

Create `package/__test__/parity/oracle.ts`:

```ts
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const SILK_PNPMFILE = "/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/dist/npm/pnpmfile.cjs";

/** Silk's own pnpmfile hooks — the parity oracle. Returns null if unbuilt (test skips with guidance). */
export function loadSilkOracle(): { updateConfig(config: Record<string, unknown>): Record<string, unknown> } | null {
  if (!existsSync(SILK_PNPMFILE)) return null;
  const req = createRequire(import.meta.url);
  return (req(SILK_PNPMFILE) as { hooks: { updateConfig(c: Record<string, unknown>): Record<string, unknown> } }).hooks;
}
```

- [x] **Step 2: Write the battery + differential test**

Create `package/__test__/parity/parity.int.test.ts`:

```ts
import { Effect } from "effect";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHooks } from "../../src/runtime/index.js";
import { freeze } from "../../src/plugin/freeze.js";
import { loadSilkOracle } from "./oracle.js";
import { silkConfig } from "./silk.config.js";

const INPUTS: Array<Record<string, unknown>> = [
  {},
  { catalogs: { silk: { typescript: "5.0.0" } } },
  { strictDepBuilds: false, minimumReleaseAge: 60 },
  { allowBuilds: { esbuild: true, "some-blocked-pkg": true } },
  { publicHoistPattern: ["local-only"], packageExtensions: { foo: { dependencies: { bar: "1" } } } },
  { rootProjectManifest: { name: "savvy-web-systems" } },
  { rootProjectManifest: { name: "vitest-agent" } },
  { peerDependencyRules: { allowAny: ["react"], ignoreMissing: ["@x/y"] } },
  { overrides: { "tar@<6.2.1": ">=7" } },
];

let our: { updateConfig(c: Record<string, unknown>): Record<string, unknown> };
const silk = loadSilkOracle();

beforeAll(async () => {
  const { base, manifest } = await Effect.runPromise(freeze(silkConfig));
  our = createHooks(base, manifest);
});

afterEach(() => vi.restoreAllMocks());

describe("Silk merge parity (differential)", () => {
  it.runIf(silk !== null).each(INPUTS)("matches Silk for input %#", (input) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ours = our.updateConfig(structuredClone(input));
    const theirs = silk!.updateConfig(structuredClone(input));
    expect(ours).toEqual(theirs);
  });

  it("oracle is present (build Silk if this fails)", () => {
    expect(silk, "Silk oracle pnpmfile not found — run `pnpm -C <silk> run build`").not.toBeNull();
  });
});
```

- [x] **Step 3: Run — diagnose any drift**

Run: `pnpm exec vitest run package/__test__/parity/parity.int.test.ts`
Expected: PASS for all battery inputs. A failure is a real merge-semantics drift between the M2 engine and Silk — investigate the diffed field. If the drift is one of the three accepted §2.4 divergences AND it touches merged output for a *constructed* adversarial input only (e.g. an input that re-adds an excluded hoist), move that input out of the gate and document it (M3 design §4.2); otherwise it is a genuine bug to fix in the engine.

- [x] **Step 4: Commit**

```bash
git add package/__test__/parity
git commit -m "test: differential merge-parity harness against Silk pnpmfile

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 3: Warning-presence parity + ported Silk integration cases

Assert the override/security boxes fire as Silk's do (presence, not bytes), and fold in Silk's own integration scenarios.

**Files:**

- Modify/Create: `package/__test__/parity/warnings-parity.int.test.ts`

**Interfaces:**

- Consumes: `silkConfig`, `freeze`, `createHooks`.

- [x] **Step 1: Read Silk's integration scenarios**

Read `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/__test__/integration/pnpmfile.int.test.ts`. Extract its input scenarios (config overriding catalogs, loosening security, etc.) — add any not already in Task 2's battery to `INPUTS` (refactor `INPUTS` into a shared `package/__test__/parity/inputs.ts` if convenient).

- [x] **Step 2: Write the warning-presence test**

Create `package/__test__/parity/warnings-parity.int.test.ts`:

```ts
import { Effect } from "effect";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHooks } from "../../src/runtime/index.js";
import { freeze } from "../../src/plugin/freeze.js";
import { silkConfig } from "./silk.config.js";

let our: { updateConfig(c: Record<string, unknown>): Record<string, unknown> };
beforeAll(async () => {
  const { base, manifest } = await Effect.runPromise(freeze(silkConfig));
  our = createHooks(base, manifest);
});
afterEach(() => vi.restoreAllMocks());

describe("warning-box presence parity", () => {
  it("fires an override box when a catalog entry is overridden", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    our.updateConfig({ catalogs: { silk: { typescript: "5.0.0" } } });
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("OVERRIDE DETECTED");
  });
  it("fires a security box when a security flag is loosened", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    our.updateConfig({ strictDepBuilds: false });
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("SECURITY OVERRIDE DETECTED");
  });
  it("is silent when the local config matches Silk", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    our.updateConfig({});
    expect(warn).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 3: Run — verify pass**

Run: `pnpm exec vitest run package/__test__/parity/warnings-parity.int.test.ts`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add package/__test__/parity
git commit -m "test: warning-box presence parity + Silk integration scenarios

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 4: Finalize Phase 1 — full gate + design-doc reconciliation

**Files:**

- Modify: design docs (via the design-doc-agent if available, else directly): mark M3 complete, Phase 1 complete.

- [x] **Step 1: Full suite + lint + build green**

Run: `pnpm exec vitest run` (full suite — M1+M2+M3) ; `pnpm lint` ; `pnpm build`
Expected: all green; API Extractor report clean (errors 0 / ciFatal 0).

- [x] **Step 2: Record the accepted divergences in the M3 design as resolved**

Update `phase1-m3-design.md` §4 to mark each of the three divergences as verified-parity-neutral (or fixed, if Task 2 surfaced a real bug), citing the parity test. Mark §1 status as implemented.

- [x] **Step 3: Mark Phase 1 complete**

Update `phase1-design.md` and the project memory: M1+M2+M3 shipped; Phase 1 (Silk-equivalent engine, proven against Silk) complete. Next: Phase 2 (CLI resolver) / Phase 3 (full schema) — separate cycles (M3 design §8).

- [x] **Step 4: Commit**

```bash
git add .claude/design
git commit -m "docs: M3 + Phase 1 complete (Silk parity proven)

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Self-Review

- **Spec coverage:** faithful `silk.config.ts` transcription + base-parity (Task 1) ✓; differential merged-config gate against Silk's pnpmfile (Task 2) ✓; warning-presence parity + ported Silk scenarios (Task 3) ✓; three §2.4 divergences reconciled/documented (Tasks 2–4, design §4) ✓; finalize Phase 1 (Task 4) ✓. Deferred per design §8: Phase 2/3, pre-publish hardening.
- **Placeholder scan:** the only `/* … */` is Task 1's transcription, explicitly instructed to be filled from the named oracle file — a transcription instruction, not a code placeholder. All test code is complete.
- **Type consistency:** uses the as-built M2 API verbatim (`freeze → {base, manifest}`, `createHooks(base, manifest)`, `publicHoistPattern: { value, excludeByRepo }`); the plan flags that as-built code wins on any drift.

---

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>
