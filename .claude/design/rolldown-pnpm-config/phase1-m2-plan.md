# rolldown-pnpm-config — Phase 1 Milestone 2 (Strategy Engine) Implementation Plan

> **Status: COMPLETED.** Shipped on `feat/m2-strategy-engine` (`0601814..205519c`, all eight tasks landed). Outcomes — including the deviations from this plan (grouped strategy file layout, `EnforcementError` as a plain `Error`, the `@public` promotion of `Enforcement`/`ManifestEntry`/`Manifest`/`Base`, and the two intentional Silk divergences) — are recorded in `phase1-m2-design.md` (§2.4, §10, §11). The unchecked `- [ ]` boxes below are left as the historical task script; this plan is no longer the source of truth for the as-built design.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize M1's catalogs-only engine into the full merge engine for every pnpm field Silk manages — a strategy model that separates detection (`divergences`) from response (`enforcement`), ported 1:1 from Silk's pure merge functions into the zero-dependency runtime, with override + security console boxes and a data-driven hoist refine.

**Architecture:** Build-time `freeze` (Effect) validates each declared field and emits two plain-data structures — `base` (field→frozen value) and `manifest` (field→{strategy name, enforcement}). The zero-dep runtime `createHooks(base, manifest)` builds a strategy table (built-ins by name) and, per field, runs the strategy (`{merged, divergences}`), applies any refine, then applies enforcement (`absent`→silent, `warn`→console box, `error`→throw). Strategies and box formatters are ported verbatim from Silk's `src/hooks/`.

**Tech Stack:** TypeScript (ESM, `.js` extensions), Effect (build-time only, in `freeze`), rolldown (plugin type), `@savvy-web/bundler` (build), `@savvy-web/vitest` (tests, auto-discovers `package/__test__`), Node ≥24.11.

## Global Constraints

- **Package:** `rolldown-pnpm-config` (library in `package/`; consumer `pnpm-plugin-example` in `example/`).
- **Zero-dependency runtime:** everything under `package/src/runtime/` must import only other runtime files and `node:` builtins — NEVER `effect` or any npm package. The shipped `pnpmfile.mjs` must contain no `from "effect"`. (`node:fs`/`node:path` are allowed — they ship in the bundle fine.)
- **Effect only at build time:** `freeze.ts` and the plugin may import `effect`; nothing under `runtime/` may.
- **Plain-JS emitted modules** (settled in M1): emitted virtual-module source has no TS annotations / no `import type`. Types come from ambient `.d.ts`.
- **Determinism:** emitted `base`/`manifest` literals have recursively sorted object keys (reuse `sortKeys`).
- **Silk parity is the oracle, not the gate:** every strategy/box must match Silk's `src/hooks/` behavior byte-for-byte, but full Silk-config parity snapshots are **M3**. M2's gate is the engine + all strategies + enforcement, unit- and runtime-integration-tested, with the example exercising every field.
- **Release tags:** every exported symbol needs an API Extractor release tag. Engine/strategy/runtime-internal types are `@internal`; only the `definePlugin`-facing surface and the runtime `createHooks`/`PnpmConfig`/`PnpmHooks` are `@public` (Task 8 handles this end-to-end).
- **ESM:** relative imports use `.js`; `node:` protocol for builtins.
- **Commits:** Conventional Commits + DCO signoff `Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>`. Husky lint-staged (Biome + markdownlint + tsgo) runs on commit.
- **Tests:** `package/__test__/` mirroring `src/`; unit files `*.test.ts`; relative `../src/*.js` imports; run `pnpm exec vitest run <path>` from repo root.

**Working-tree note:** the branch starts with an uncommitted user edit (`@types/node: "^26.0.0"` → `"catalog:silk"` in `package/package.json` and `example/package.json`). Per the user, this folds into Task 1's commit — `git add` it there; do not revert it.

---

## Source oracle (Silk → M2)

All ports are from `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/src/hooks/`:
`merge-scalar.ts`, `merge-map.ts`, `merge-arrays.ts`, `merge-catalogs.ts`, `merge-overrides.ts`, `merge-peer-dependency-rules.ts`, `security-warnings.ts`, `warnings.ts`, `update-config.ts`. Read the relevant file before each port task; the code below already transcribes it, but the oracle is authoritative if anything diverges.

## File Structure (M2)

New under `package/src/runtime/` (zero-dep):

- `types.ts` — engine types: `Divergence`, `RuntimeCtx`, `StrategyResult`, `Strategy`, `Enforcement`, `ManifestEntry`, `Manifest`, `Base` (the **locked contract**, Task 1). Existing `PnpmConfig`/`FrozenConfig`/`PnpmHooks` move here.
- `strategies/scalar.ts` — `scalar`, `securityFlag`, `securityMin` (share a file; differ only by detector).
- `strategies/maps.ts` — `mapChildWins`, `allowBuilds`.
- `strategies/arrays.ts` — `arrayUnion`, `arrayRecordUnion`.
- `strategies/catalogs.ts` — `catalogs`, `overrides`, `peerDependencyRules`.
- `strategies/table.ts` — `STRATEGY_TABLE: Record<string, Strategy>`.
- `warnings.ts` — `formatOverrideWarning`, `formatSecurityWarning` (verbatim Silk port).
- `ctx.ts` — `resolveRootName`, `excludeByRepo` refine.
- `enforcement.ts` — `EnforcementError`, `applyEnforcement`.
- `index.ts` — `createHooks(base, manifest)` orchestration + re-exports.

New build-time:

- `package/src/registry.ts` — `FIELD_REGISTRY: Record<string, { strategy: string; enforcement: Enforcement }>`.

Modified: `define-plugin.ts` (all fields), `plugin/freeze.ts` (multi-field → `{base, manifest}`), `plugin/serialize.ts` (`emitPnpmfileModule(base, manifest)`), `plugin/index.ts` (pass base+manifest), `index.ts` (exports), `example/savvy.build.ts` (exercise fields).

Tests under `package/__test__/` mirror the above.

---

### Task 1: Engine spike — locked types + generalized freeze/runtime, proven with `confirmModulesPurge`

The architectural task. Reify the engine type contract (every later task quotes it), generalize `freeze`→`{base, manifest}` and `createHooks(base, manifest)`, and prove the whole path end-to-end with the registry + ONE quiet field (`confirmModulesPurge`, the simplest scalar). Catalogs must keep working unchanged.

**Files:**

- Create: `package/src/runtime/types.ts`, `package/src/runtime/strategies/scalar.ts`, `package/src/runtime/strategies/table.ts`, `package/src/runtime/enforcement.ts`, `package/src/registry.ts`
- Modify: `package/src/runtime/index.ts`, `package/src/plugin/freeze.ts`, `package/src/plugin/serialize.ts`, `package/src/plugin/index.ts`, `package/src/define-plugin.ts`, `package/src/index.ts`, `example/savvy.build.ts`
- Test: `package/__test__/runtime/engine.test.ts`, `package/__test__/plugin/freeze.test.ts` (extend)

**Interfaces (THE LOCKED CONTRACT — later tasks quote this verbatim):**

```ts
// package/src/runtime/types.ts
export interface Divergence {
  readonly setting: string;
  readonly silkValue: string;
  readonly childValue: string;
  readonly detail: string;
  readonly kind: "override" | "security";
}
export interface RuntimeCtx {
  readonly rootName: string | undefined;
}
export interface StrategyResult {
  readonly merged: unknown;
  readonly divergences: readonly Divergence[];
}
export type Strategy = (base: unknown, local: unknown, ctx: RuntimeCtx) => StrategyResult;
export type Enforcement = "absent" | "warn" | "error";
export interface ManifestEntry {
  readonly strategy: string;
  readonly enforcement: Enforcement;
  readonly options?: Record<string, unknown>;
}
export type Manifest = Record<string, ManifestEntry>;
export type Base = Record<string, unknown>;
```

- Produces: `createHooks(base: Base, manifest: Manifest): PnpmHooks` (signature CHANGES from M1's `createHooks(frozen)`). `freeze(config): Effect<{ base: Base; manifest: Manifest }, ConfigError>`. `FIELD_REGISTRY`. `applyEnforcement(field, result, enforcement): { value: unknown; overrides: Divergence[]; security: Divergence[] }`. `STRATEGY_TABLE`.

- [ ] **Step 1: Move + extend runtime types**

Create `package/src/runtime/types.ts` with the locked contract above, PLUS the existing M1 types moved here (each keeps `@public`):

```ts
/** Minimal pnpm config shape — only the fields this plugin reads/writes. @public */
export interface PnpmConfig {
  catalogs?: Record<string, Record<string, string>>;
  [key: string]: unknown;
}
/** The pnpm pnpmfile hooks object. @public */
export interface PnpmHooks {
  updateConfig(config: PnpmConfig): PnpmConfig;
}
```

(The locked-contract types above are `@internal` — add `@internal` JSDoc to each. `FrozenConfig` from M1 is removed; `freeze` now returns `{ base, manifest }`.)

- [ ] **Step 2: Write the failing engine test**

Create `package/__test__/runtime/engine.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createHooks } from "../../src/runtime/index.js";

describe("createHooks engine", () => {
  it("merges catalogs via the catalogs strategy (M1 parity)", () => {
    const base = { catalogs: { silk: { a: "1.0.0", b: "2.0.0" } } };
    const manifest = { catalogs: { strategy: "catalogs", enforcement: "warn" as const } };
    const out = createHooks(base, manifest).updateConfig({ catalogs: { silk: { b: "9.9.9", c: "3.0.0" } } });
    expect(out.catalogs).toEqual({ silk: { a: "1.0.0", b: "9.9.9", c: "3.0.0" } });
  });

  it("applies a quiet scalar field (confirmModulesPurge) silently, child wins", () => {
    const base = { confirmModulesPurge: true };
    const manifest = { confirmModulesPurge: { strategy: "scalar", enforcement: "absent" as const } };
    expect(createHooks(base, manifest).updateConfig({}).confirmModulesPurge).toBe(true);
    expect(createHooks(base, manifest).updateConfig({ confirmModulesPurge: false }).confirmModulesPurge).toBe(false);
  });

  it("omits a field whose merged value is undefined/empty", () => {
    const out = createHooks({}, {}).updateConfig({ dir: "/x" });
    expect(out.dir).toBe("/x");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run package/__test__/runtime/engine.test.ts`
Expected: FAIL — `createHooks` still has the M1 one-arg signature / no strategy table.

- [ ] **Step 4: Implement the scalar strategy + catalogs strategy (minimal table)**

Create `package/src/runtime/strategies/scalar.ts`:

```ts
import type { Strategy } from "../types.js";

/** `child ?? silk` — quiet (no divergences). Ports Silk merge-scalar.ts. @internal */
export const scalar: Strategy = (base, local) => ({
  merged: local ?? base,
  divergences: [],
});
```

Create `package/src/runtime/strategies/catalogs.ts` (the catalogs field strategy — M1's loop + override detection; detection lands fully in Task 3, but the merge must work now):

```ts
import type { Divergence, Strategy } from "../types.js";

/** Merge each named catalog; child wins per package. Emits override divergences. Ports merge-catalogs.ts. @internal */
export const catalogs: Strategy = (base, local) => {
  const silk = (base ?? {}) as Record<string, Record<string, string>>;
  const child = (local ?? {}) as Record<string, Record<string, string>>;
  const divergences: Divergence[] = [];
  const merged: Record<string, Record<string, string>> = { ...child };
  for (const [name, entries] of Object.entries(silk)) {
    const childCat = child[name] ?? {};
    const out: Record<string, string> = { ...entries };
    for (const [pkg, childVersion] of Object.entries(childCat)) {
      const silkVersion = entries[pkg];
      if (silkVersion !== undefined && silkVersion !== childVersion) {
        divergences.push({
          setting: `catalogs.${name}.${pkg}`,
          silkValue: silkVersion,
          childValue: childVersion,
          detail: "Local version overrides the Silk-managed version.",
          kind: "override",
        });
      }
      out[pkg] = childVersion;
    }
    merged[name] = out;
  }
  return { merged, divergences };
};
```

Create `package/src/runtime/strategies/table.ts`:

```ts
import type { Strategy } from "../types.js";
import { catalogs } from "./catalogs.js";
import { scalar } from "./scalar.js";

/** Built-in strategies keyed by manifest name. @internal */
export const STRATEGY_TABLE: Record<string, Strategy> = {
  scalar,
  catalogs,
};
```

- [ ] **Step 5: Implement enforcement + createHooks orchestration**

Create `package/src/runtime/enforcement.ts`:

```ts
import type { Divergence, Enforcement, StrategyResult } from "./types.js";

/** Apply enforcement to a strategy result. @internal */
export function applyEnforcement(
  field: string,
  result: StrategyResult,
  enforcement: Enforcement,
): { value: unknown; overrides: Divergence[]; security: Divergence[] } {
  const overrides: Divergence[] = [];
  const security: Divergence[] = [];
  if (result.divergences.length > 0 && enforcement === "warn") {
    for (const d of result.divergences) (d.kind === "security" ? security : overrides).push(d);
  }
  // `error` enforcement is handled in Task 5 (throw). For now it behaves like warn.
  if (result.divergences.length > 0 && enforcement === "error") {
    for (const d of result.divergences) (d.kind === "security" ? security : overrides).push(d);
  }
  return { value: result.merged, overrides, security };
}
```

Replace `package/src/runtime/index.ts`:

```ts
export * from "./types.js";
import type { Base, Manifest, PnpmConfig, PnpmHooks, RuntimeCtx } from "./types.js";
import { applyEnforcement } from "./enforcement.js";
import { STRATEGY_TABLE } from "./strategies/table.js";

/**
 * Build the pnpm hooks from frozen base data + a field→strategy manifest.
 * Zero dependencies — bundled verbatim into the shipped pnpmfile.
 * @public
 */
export function createHooks(base: Base, manifest: Manifest): PnpmHooks {
  return {
    updateConfig(config) {
      const ctx: RuntimeCtx = { rootName: undefined }; // ctx resolution lands in Task 6
      const out: PnpmConfig = { ...config };
      for (const [field, entry] of Object.entries(manifest)) {
        const strategy = STRATEGY_TABLE[entry.strategy];
        if (!strategy) continue;
        const result = strategy(base[field], config[field], ctx);
        const { value } = applyEnforcement(field, result, entry.enforcement);
        if (value !== undefined && !(typeof value === "object" && value !== null && Object.keys(value).length === 0)) {
          out[field] = value;
        }
      }
      return out;
    },
  };
}
```

(Console output of the collected `overrides`/`security` divergences lands in Tasks 3–4; Task 1 collects but does not print.)

- [ ] **Step 6: Run the engine test — verify it passes**

Run: `pnpm exec vitest run package/__test__/runtime/engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Generalize `freeze` to emit `{ base, manifest }`**

Add `package/src/registry.ts`:

```ts
import type { Enforcement } from "./runtime/types.js";

/** Maps each known pnpm field to its strategy + Silk-matching default enforcement. @internal */
export const FIELD_REGISTRY: Record<string, { readonly strategy: string; readonly enforcement: Enforcement }> = {
  catalogs: { strategy: "catalogs", enforcement: "warn" },
  confirmModulesPurge: { strategy: "scalar", enforcement: "absent" },
};
```

Replace `package/src/plugin/freeze.ts` (multi-field; catalogs + confirmModulesPurge for the spike):

```ts
import { Data, Effect } from "effect";
import type { PluginConfig } from "../define-plugin.js";
import { FIELD_REGISTRY } from "../registry.js";
import type { Base, Enforcement, Manifest } from "../runtime/types.js";

/** Typed failure for invalid plugin configuration, surfaced as a build error. @internal */
export class ConfigError extends Data.TaggedError("ConfigError")<{ readonly message: string }> {}

interface FieldDecl {
  readonly value: unknown;
  readonly enforcement?: Enforcement;
}
function normalizeField(input: unknown): FieldDecl {
  if (input !== null && typeof input === "object" && "value" in (input as object)) {
    return input as FieldDecl;
  }
  return { value: input };
}

/** Validate + freeze the plugin config into base data + a strategy manifest. @internal */
export function freeze(config: PluginConfig): Effect.Effect<{ base: Base; manifest: Manifest }, ConfigError> {
  return Effect.gen(function* () {
    const base: Base = {};
    const manifest: Manifest = {};
    // catalogs is always present and special: its value is the resolved map.
    base.catalogs = config.catalogs.catalogs;
    manifest.catalogs = { strategy: "catalogs", enforcement: "warn" };
    for (const [field, reg] of Object.entries(FIELD_REGISTRY)) {
      if (field === "catalogs") continue;
      const raw = (config as Record<string, unknown>)[field];
      if (raw === undefined) continue;
      const decl = normalizeField(raw);
      base[field] = decl.value;
      manifest[field] = { strategy: reg.strategy, enforcement: decl.enforcement ?? reg.enforcement };
    }
    if (base.catalogs === undefined) {
      return yield* new ConfigError({ message: "catalogs is required" });
    }
    return { base, manifest };
  });
}
```

- [ ] **Step 8: Update `define-plugin`, `serialize`, `plugin/index`**

`package/src/define-plugin.ts` — add `confirmModulesPurge` (the spike field) and the `FieldInput` type:

```ts
import type { CatalogsResult } from "./define-catalogs.js";
import type { Enforcement } from "./runtime/types.js";

/** A field value, bare or wrapped with an explicit enforcement override. @public */
export type FieldInput<T> = T | { readonly value: T; readonly enforcement?: Enforcement };

/** The declarative plugin configuration. @public */
export interface PluginConfig {
  readonly catalogs: CatalogsResult;
  readonly confirmModulesPurge?: FieldInput<boolean>;
}

/** Identity-with-types builder for the plugin configuration. @public */
export function definePlugin(input: PluginConfig): PluginConfig {
  return input;
}
```

`package/src/plugin/serialize.ts` — replace `emitPnpmfileModule` to take base+manifest (keep `sortKeys` and `emitCatalogsModule` unchanged; `emitCatalogsModule` now receives `base.catalogs`):

```ts
/** Source for the `pnpmfile` virtual module: createHooks over base + manifest. */
export function emitPnpmfileModule(base: Record<string, unknown>, manifest: Record<string, unknown>): string {
  const b = JSON.stringify(sortKeys(base));
  const m = JSON.stringify(sortKeys(manifest));
  return [
    'import { createHooks } from "rolldown-pnpm-config/runtime";',
    `export const hooks = createHooks(${b}, ${m});`,
    "",
  ].join("\n");
}
```

`package/src/plugin/index.ts` — the `load` for the pnpmfile id now passes base+manifest; the catalogs id reads `base.catalogs`:

```ts
    async load(id) {
      if (id === `\0${PNPMFILE_SPEC}`) {
        const { base, manifest } = await getFrozen();
        return emitPnpmfileModule(base, manifest);
      }
      if (id === `\0${CATALOGS_SPEC}`) {
        const { base } = await getFrozen();
        return emitCatalogsModule((base.catalogs ?? {}) as Record<string, Record<string, string>>);
      }
      return null;
    },
```

(Update `PluginDeps.freeze` / `getFrozen` types: `freeze` now returns `Effect<{ base; manifest }, ConfigError>`. Adjust the imported types accordingly.)

- [ ] **Step 9: Update existing tests for the new shapes**

`package/__test__/plugin/freeze.test.ts` — the valid case now asserts `{ base, manifest }`:

```ts
const out = await Effect.runPromise(freeze(definePlugin({ catalogs: defineCatalogs([{ name: "silk", packages: { a: "1.0.0" } }]) })));
expect(out.base.catalogs).toEqual({ silk: { a: "1.0.0" } });
expect(out.manifest.catalogs).toEqual({ strategy: "catalogs", enforcement: "warn" });
```

`package/__test__/plugin/plugin.test.ts` and `package/__test__/plugin/serialize.test.ts` and `package/__test__/runtime/create-hooks.test.ts` — update to the new `createHooks(base, manifest)` / `emitPnpmfileModule(base, manifest)` signatures (the create-hooks catalog cases become `createHooks({catalogs:{...}}, {catalogs:{strategy:"catalogs",enforcement:"warn"}})`). Keep their behavioral assertions.

- [ ] **Step 10: Wire the example + build green**

`example/savvy.build.ts` — add `confirmModulesPurge` to the config to exercise the new field:

```ts
const plugin = definePlugin({
  catalogs: defineCatalogs([{ name: "silk", peers: true, packages: { typescript: "^5.9.0", vitest: "^4.0.0" } }]),
  confirmModulesPurge: false,
});
```

Run: `pnpm exec vitest run` (full package suite)
Expected: all green (engine + updated existing tests).

Run: `pnpm -C package build:dev && pnpm -C example build:dev`
Expected: both succeed; `example/dist/dev/pkg/pnpmfile.mjs` contains `createHooks(` with two arguments.

Run: `grep -c 'from "effect"' example/dist/dev/pkg/pnpmfile.mjs`
Expected: `0` (runtime stays effect-free).

- [ ] **Step 11: Commit**

```bash
git add package/src package/__test__ example/savvy.build.ts package/package.json example/package.json
git commit -m "feat: generalize engine to base+manifest with strategy table

Locks the engine type contract (Strategy/Divergence/RuntimeCtx/ManifestEntry),
generalizes freeze to emit base+manifest, and createHooks to apply per-field
strategies + enforcement. Proven with catalogs (M1 parity) + confirmModulesPurge.
Also folds in @types/node -> catalog:silk.

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 2: Quiet strategies — `mapChildWins`, `arrayUnion`, `arrayRecordUnion` + their fields

Port the three quiet strategies (no divergences) and register their fields. All default `absent`.

**Files:**

- Create: `package/src/runtime/strategies/maps.ts`, `package/src/runtime/strategies/arrays.ts`
- Modify: `package/src/runtime/strategies/table.ts`, `package/src/registry.ts`, `package/src/define-plugin.ts`
- Test: `package/__test__/runtime/strategies/quiet.test.ts`

**Interfaces:**

- Consumes: `Strategy` (Task 1 locked contract).
- Produces: `mapChildWins`, `arrayUnion`, `arrayRecordUnion: Strategy`. Registry entries for `packageExtensions`, `allowedDeprecatedVersions` (`mapChildWins`/`absent`), `publicHoistPattern`, `minimumReleaseAgeExclude` (`arrayUnion`/`absent`), `supportedArchitectures`, `auditConfig` (`arrayRecordUnion`/`absent`).

- [ ] **Step 1: Write the failing test**

Create `package/__test__/runtime/strategies/quiet.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { arrayRecordUnion, arrayUnion } from "../../../src/runtime/strategies/arrays.js";
import { mapChildWins } from "../../../src/runtime/strategies/maps.js";

const ctx = { rootName: undefined };

describe("mapChildWins", () => {
  it("overlays child entries on silk, no divergences", () => {
    const r = mapChildWins({ a: 1, b: 2 }, { b: 9, c: 3 }, ctx);
    expect(r.merged).toEqual({ a: 1, b: 9, c: 3 });
    expect(r.divergences).toEqual([]);
  });
});

describe("arrayUnion", () => {
  it("unions + sorts, no divergences", () => {
    const r = arrayUnion(["b", "a"], ["a", "c"], ctx);
    expect(r.merged).toEqual(["a", "b", "c"]);
    expect(r.divergences).toEqual([]);
  });
});

describe("arrayRecordUnion", () => {
  it("unions per axis, drops empty, no divergences", () => {
    const r = arrayRecordUnion({ os: ["linux"] }, { os: ["darwin"], cpu: [] }, ctx);
    expect(r.merged).toEqual({ os: ["darwin", "linux"] });
    expect(r.divergences).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm exec vitest run package/__test__/runtime/strategies/quiet.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement the strategies**

Create `package/src/runtime/strategies/maps.ts`:

```ts
import type { Strategy } from "../types.js";

/** `{...silk, ...child}`. Quiet. Ports Silk merge-map.ts. @internal */
export const mapChildWins: Strategy = (base, local) => {
  const silk = (base ?? {}) as Record<string, unknown>;
  const child = local as Record<string, unknown> | undefined;
  return { merged: child ? { ...silk, ...child } : { ...silk }, divergences: [] };
};
```

Create `package/src/runtime/strategies/arrays.ts` (ports `merge-arrays.ts`):

```ts
import type { Strategy } from "../types.js";

function unionSort(silk: readonly string[], local: readonly string[] | undefined): string[] {
  const set = new Set(silk);
  for (const item of local ?? []) set.add(item);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Union + sort string arrays. Quiet. @internal */
export const arrayUnion: Strategy = (base, local) => ({
  merged: unionSort((base ?? []) as string[], local as string[] | undefined),
  divergences: [],
});

/** Per-axis union of a record of string arrays; drops empty axes. Quiet. @internal */
export const arrayRecordUnion: Strategy = (base, local) => {
  const silk = (base ?? {}) as Record<string, readonly string[] | undefined>;
  const child = (local ?? {}) as Record<string, readonly string[] | undefined>;
  const keys = new Set([...Object.keys(silk), ...Object.keys(child)]);
  const result: Record<string, string[]> = {};
  for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
    const merged = unionSort(silk[key] ?? [], child[key]);
    if (merged.length > 0) result[key] = merged;
  }
  return { merged: result, divergences: [] };
};
```

- [ ] **Step 4: Register the strategies + fields**

`package/src/runtime/strategies/table.ts` — add imports + entries: `mapChildWins`, `arrayUnion`, `arrayRecordUnion`.

`package/src/registry.ts` — add:

```ts
  packageExtensions: { strategy: "mapChildWins", enforcement: "absent" },
  allowedDeprecatedVersions: { strategy: "mapChildWins", enforcement: "absent" },
  publicHoistPattern: { strategy: "arrayUnion", enforcement: "absent" },
  minimumReleaseAgeExclude: { strategy: "arrayUnion", enforcement: "absent" },
  supportedArchitectures: { strategy: "arrayRecordUnion", enforcement: "absent" },
  auditConfig: { strategy: "arrayRecordUnion", enforcement: "absent" },
```

`package/src/define-plugin.ts` — add the fields to `PluginConfig`:

```ts
  readonly packageExtensions?: FieldInput<Record<string, unknown>>;
  readonly allowedDeprecatedVersions?: FieldInput<Record<string, string>>;
  readonly publicHoistPattern?: FieldInput<string[]>;
  readonly minimumReleaseAgeExclude?: FieldInput<string[]>;
  readonly supportedArchitectures?: FieldInput<Record<string, string[]>>;
  readonly auditConfig?: FieldInput<Record<string, string[]>>;
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `pnpm exec vitest run package/__test__/runtime/strategies/quiet.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package/src package/__test__
git commit -m "feat: quiet strategies (map/array/arrayRecord) + their fields

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 3: Override box + override strategies (`catalogs` detection, `overrides`, `peerDependencyRules`)

Port the override-warning box and the override-detecting strategies, and wire `warn` enforcement to print the box.

**Files:**

- Create: `package/src/runtime/warnings.ts`, `package/src/runtime/strategies/overrides.ts` (holds `overrides` + `peerDependencyRules`)
- Modify: `package/src/runtime/index.ts` (print collected boxes), `package/src/runtime/strategies/table.ts`, `package/src/registry.ts`, `package/src/define-plugin.ts`
- Test: `package/__test__/runtime/strategies/override.test.ts`, `package/__test__/runtime/warnings.test.ts`

**Interfaces:**

- Consumes: `Strategy`, `Divergence` (Task 1); `catalogs` strategy (Task 1).
- Produces: `formatOverrideWarning(divergences): string`; `overrides`, `peerDependencyRules: Strategy`. Registry entries for `overrides`, `peerDependencyRules` (both `catalogs`-kind / `warn`). The runtime now prints collected boxes via `console.warn`.

- [ ] **Step 1: Write the failing tests**

Create `package/__test__/runtime/strategies/override.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { catalogs } from "../../../src/runtime/strategies/catalogs.js";
import { overrides } from "../../../src/runtime/strategies/overrides.js";

const ctx = { rootName: undefined };

describe("catalogs override detection", () => {
  it("emits an override divergence when local differs from silk", () => {
    const r = catalogs({ silk: { a: "1.0.0" } }, { silk: { a: "2.0.0" } }, ctx);
    expect(r.divergences).toHaveLength(1);
    expect(r.divergences[0]).toMatchObject({ setting: "catalogs.silk.a", silkValue: "1.0.0", childValue: "2.0.0", kind: "override" });
  });
  it("no divergence when local matches or is absent", () => {
    expect(catalogs({ silk: { a: "1.0.0" } }, { silk: { a: "1.0.0" } }, ctx).divergences).toEqual([]);
  });
});

describe("overrides strategy", () => {
  it("child wins, emits override divergence on conflict", () => {
    const r = overrides({ "tar@<1": ">=1" }, { "tar@<1": ">=2" }, ctx);
    expect(r.merged).toEqual({ "tar@<1": ">=2" });
    expect(r.divergences[0]).toMatchObject({ setting: "overrides.tar@<1", kind: "override" });
  });
});
```

Create `package/__test__/runtime/warnings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatOverrideWarning } from "../../src/runtime/warnings.js";

describe("formatOverrideWarning", () => {
  it("returns empty string for no divergences", () => {
    expect(formatOverrideWarning([])).toBe("");
  });
  it("renders a box containing the setting and both versions", () => {
    const box = formatOverrideWarning([{ setting: "catalogs.silk.a", silkValue: "1.0.0", childValue: "2.0.0", detail: "", kind: "override" }]);
    expect(box).toContain("SILK CATALOG OVERRIDE DETECTED");
    expect(box).toContain("catalogs.silk.a");
    expect(box).toContain("1.0.0");
    expect(box).toContain("2.0.0");
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run package/__test__/runtime/strategies/override.test.ts package/__test__/runtime/warnings.test.ts`
Expected: FAIL — modules missing (`overrides.ts`, `warnings.ts`).

- [ ] **Step 3: Implement the override box** (port `warnings.ts` `formatOverrideWarning` verbatim — 75-char box)

Create `package/src/runtime/warnings.ts` porting Silk's `formatOverrideWarning` and `formatSecurityWarning` (read `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/src/hooks/warnings.ts` and transcribe both `format*` functions, adapting input type to the M2 `Divergence[]` — `Divergence.setting` replaces the Silk `catalog`+`package` pair, so the override box prints `divergence.setting` directly instead of reconstructing `catalogs.<catalog>.<package>`). Keep `WARNING_BOX_WIDTH = 75` and the exact box characters. Export `formatOverrideWarning(divergences: readonly Divergence[]): string` and `formatSecurityWarning(divergences: readonly Divergence[]): string` (the latter used in Task 4).

- [ ] **Step 4: Implement `overrides` + `peerDependencyRules` strategies**

Create `package/src/runtime/strategies/overrides.ts` (ports `merge-overrides.ts` + `merge-peer-dependency-rules.ts`):

```ts
import type { Divergence, Strategy } from "../types.js";

function mergeMapDetect(prefix: string, silk: Record<string, string>, child: Record<string, string>): { merged: Record<string, string>; divergences: Divergence[] } {
  const merged: Record<string, string> = { ...silk };
  const divergences: Divergence[] = [];
  for (const [k, childVersion] of Object.entries(child)) {
    const silkVersion = silk[k];
    if (silkVersion !== undefined && silkVersion !== childVersion) {
      divergences.push({ setting: `${prefix}.${k}`, silkValue: silkVersion, childValue: childVersion, detail: "Local version overrides the Silk-managed version.", kind: "override" });
    }
    merged[k] = childVersion;
  }
  return { merged, divergences };
}

/** Security overrides: child wins per key, any diff → override divergence. @internal */
export const overrides: Strategy = (base, local) => {
  const { merged, divergences } = mergeMapDetect("overrides", (base ?? {}) as Record<string, string>, (local ?? {}) as Record<string, string>);
  return { merged, divergences };
};

/** peerDependencyRules: allowedVersions=override-detect; ignoreMissing/allowAny=union. @internal */
export const peerDependencyRules: Strategy = (base, local) => {
  const silk = (base ?? {}) as { allowedVersions?: Record<string, string>; ignoreMissing?: string[]; allowAny?: string[] };
  const child = (local ?? {}) as typeof silk;
  const av = mergeMapDetect("peerDependencyRules.allowedVersions", silk.allowedVersions ?? {}, child.allowedVersions ?? {});
  const union = (s: string[] = [], c: string[] = []) => [...new Set([...s, ...c])].sort((a, b) => a.localeCompare(b));
  return {
    merged: {
      allowedVersions: av.merged,
      ignoreMissing: union(silk.ignoreMissing, child.ignoreMissing),
      allowAny: union(silk.allowAny, child.allowAny),
    },
    divergences: av.divergences,
  };
};
```

- [ ] **Step 5: Wire box printing into the runtime**

`package/src/runtime/index.ts` — collect overrides/security across fields and print after the loop:

```ts
import { formatOverrideWarning, formatSecurityWarning } from "./warnings.js";
// ...inside updateConfig, accumulate:
const allOverrides: Divergence[] = [];
const allSecurity: Divergence[] = [];
// ...per field: const { value, overrides, security } = applyEnforcement(...); allOverrides.push(...overrides); allSecurity.push(...security);
// ...after loop:
const ob = formatOverrideWarning(allOverrides); if (ob) console.warn(ob);
const sb = formatSecurityWarning(allSecurity); if (sb) console.warn(sb);
```

Register in `table.ts` (`overrides`, `peerDependencyRules`) and `registry.ts`:

```ts
  overrides: { strategy: "overrides", enforcement: "warn" },
  peerDependencyRules: { strategy: "peerDependencyRules", enforcement: "warn" },
```

`define-plugin.ts` — add `overrides?: FieldInput<Record<string, string>>` and `peerDependencyRules?: FieldInput<{ allowedVersions?: Record<string,string>; ignoreMissing?: string[]; allowAny?: string[] }>`.

- [ ] **Step 6: Run all new tests — verify pass**

Run: `pnpm exec vitest run package/__test__/runtime`
Expected: PASS (override + warnings + engine + quiet tests).

- [ ] **Step 7: Commit**

```bash
git add package/src package/__test__
git commit -m "feat: override box + catalogs/overrides/peerDependencyRules detection

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 4: Security box + security strategies (`securityFlag`, `securityMin`, `allowBuilds`)

Port the three directional security detectors and the security box; wire the security fields.

**Files:**

- Modify: `package/src/runtime/strategies/scalar.ts` (add `securityFlag`, `securityMin`), `package/src/runtime/strategies/maps.ts` (add `allowBuilds`), `package/src/runtime/strategies/table.ts`, `package/src/registry.ts`, `package/src/define-plugin.ts`
- Test: `package/__test__/runtime/strategies/security.test.ts`

**Interfaces:**

- Consumes: `Strategy`, `Divergence`, `formatSecurityWarning` (Tasks 1, 3).
- Produces: `securityFlag`, `securityMin`, `allowBuilds: Strategy`. Registry: `strictDepBuilds`, `blockExoticSubdeps` (`securityFlag`/`warn`), `minimumReleaseAge` (`securityMin`/`warn`), `allowBuilds` (`allowBuilds`/`warn`).

- [ ] **Step 1: Write the failing test**

Create `package/__test__/runtime/strategies/security.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allowBuilds } from "../../../src/runtime/strategies/maps.js";
import { securityFlag, securityMin } from "../../../src/runtime/strategies/scalar.js";

const ctx = { rootName: undefined };

describe("securityFlag", () => {
  it("flags loosening when child disables a silk-enabled flag", () => {
    const r = securityFlag(true, false, ctx);
    expect(r.merged).toBe(false);
    expect(r.divergences[0]).toMatchObject({ setting: "", childValue: "false", kind: "security" });
  });
  it("no flag when child keeps it enabled or absent", () => {
    expect(securityFlag(true, undefined, ctx).divergences).toEqual([]);
    expect(securityFlag(true, true, ctx).divergences).toEqual([]);
  });
});

describe("securityMin", () => {
  it("flags loosening when child lowers the value", () => {
    const r = securityMin(1440, 60, ctx);
    expect(r.merged).toBe(60);
    expect(r.divergences[0]).toMatchObject({ kind: "security" });
  });
  it("no flag when child raises or matches", () => {
    expect(securityMin(1440, 2880, ctx).divergences).toEqual([]);
  });
});

describe("allowBuilds", () => {
  it("flags enabling a build silk blocked", () => {
    const r = allowBuilds({ esbuild: false }, { esbuild: true }, ctx);
    expect(r.merged).toEqual({ esbuild: true });
    expect(r.divergences[0]).toMatchObject({ setting: "allowBuilds.esbuild", kind: "security" });
  });
});
```

Note: `securityFlag`/`securityMin` cannot know their own field name (the strategy table is field-agnostic), so they emit `setting: ""`; the runtime fills `setting` with the field name when collecting. Assert `setting: ""` at the strategy level; the field-name fill is covered by the runtime-integration test in Task 7.

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run package/__test__/runtime/strategies/security.test.ts`
Expected: FAIL — `securityFlag`/`securityMin`/`allowBuilds` not exported.

- [ ] **Step 3: Implement the security strategies** (port `security-warnings.ts` detectors)

Append to `package/src/runtime/strategies/scalar.ts`:

```ts
import type { Divergence, Strategy } from "../types.js";

/** `child ?? silk`; flags when child disables a silk-enabled boolean. Ports detectFlagLoosening. @internal */
export const securityFlag: Strategy = (base, local) => {
  const merged = (local ?? base) as boolean | undefined;
  const divergences: Divergence[] = [];
  if (base === true && local === false) {
    divergences.push({ setting: "", silkValue: "true", childValue: "false", detail: "Disables a security check that Silk enabled.", kind: "security" });
  }
  return { merged, divergences };
};

/** `child ?? silk`; flags when child lowers the value. Ports detectMinReleaseAgeLoosening. @internal */
export const securityMin: Strategy = (base, local) => {
  const merged = (local ?? base) as number | undefined;
  const divergences: Divergence[] = [];
  if (typeof base === "number" && typeof local === "number" && local < base) {
    divergences.push({ setting: "", silkValue: String(base), childValue: String(local), detail: `Shortens the release-age quarantine from ${base} to ${local} minutes.`, kind: "security" });
  }
  return { merged, divergences };
};
```

Append to `package/src/runtime/strategies/maps.ts`:

```ts
import type { Divergence } from "../types.js";

/** `{...silk, ...child}`; flags enabling a build silk blocked. Ports detectAllowBuildsLoosening. @internal */
export const allowBuilds: Strategy = (base, local) => {
  const silk = (base ?? {}) as Record<string, boolean>;
  const child = (local ?? {}) as Record<string, boolean>;
  const divergences: Divergence[] = [];
  for (const [pkg, childAllowed] of Object.entries(child)) {
    if (childAllowed === true && silk[pkg] === false) {
      divergences.push({ setting: `allowBuilds.${pkg}`, silkValue: "false", childValue: "true", detail: `Enables build scripts for "${pkg}" that Silk blocked.`, kind: "security" });
    }
  }
  return { merged: { ...silk, ...child }, divergences };
};
```

- [ ] **Step 4: Implement `formatSecurityWarning`** (if not already in Task 3 Step 3 — it should be; otherwise port it now from `warnings.ts` verbatim).

- [ ] **Step 5: Register + add fields**

`table.ts` — add `securityFlag`, `securityMin`, `allowBuilds`. `registry.ts`:

```ts
  strictDepBuilds: { strategy: "securityFlag", enforcement: "warn" },
  blockExoticSubdeps: { strategy: "securityFlag", enforcement: "warn" },
  minimumReleaseAge: { strategy: "securityMin", enforcement: "warn" },
  allowBuilds: { strategy: "allowBuilds", enforcement: "warn" },
```

`define-plugin.ts` — add `strictDepBuilds?: FieldInput<boolean>`, `blockExoticSubdeps?: FieldInput<boolean>`, `minimumReleaseAge?: FieldInput<number>`, `allowBuilds?: FieldInput<Record<string, boolean>>`.

**Runtime fill of `setting`:** in `package/src/runtime/index.ts`, when collecting a security divergence whose `setting === ""`, replace it with the field name. Add in the per-field loop: `const named = result.divergences.map((d) => d.setting === "" ? { ...d, setting: field } : d);` and pass `{ ...result, divergences: named }` to `applyEnforcement`.

- [ ] **Step 6: Run — verify pass**

Run: `pnpm exec vitest run package/__test__/runtime`
Expected: PASS (all runtime tests).

- [ ] **Step 7: Commit**

```bash
git add package/src package/__test__
git commit -m "feat: security box + securityFlag/securityMin/allowBuilds detectors

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 5: `error` enforcement — throw path that escapes the install guard

The one non-mechanical integration point (spec §6): an `error`-enforced divergence must **throw** and the throw must **propagate** (fail the install), not be swallowed by the catch-and-fallback guard.

**Files:**

- Create: `package/src/runtime/enforcement.ts` is modified to throw; `EnforcementError` lives in `runtime/types.ts` or `enforcement.ts`.
- Modify: `package/src/runtime/index.ts`, `package/src/runtime/enforcement.ts`
- Test: `package/__test__/runtime/enforcement.test.ts`

**Interfaces:**

- Consumes: `Divergence`, `Enforcement`, `StrategyResult` (Task 1).
- Produces: `class EnforcementError extends Error` (a plain `Error` subclass with a recognizable `name`, NOT an Effect type — the runtime is zero-dep). `applyEnforcement` throws `EnforcementError` when `enforcement === "error"` and there is ≥1 divergence.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/runtime/enforcement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHooks } from "../../src/runtime/index.js";
import { EnforcementError } from "../../src/runtime/enforcement.js";

describe("error enforcement", () => {
  it("throws EnforcementError when an error-enforced field diverges", () => {
    const base = { minimumReleaseAge: 1440 };
    const manifest = { minimumReleaseAge: { strategy: "securityMin", enforcement: "error" as const } };
    expect(() => createHooks(base, manifest).updateConfig({ minimumReleaseAge: 60 })).toThrow(EnforcementError);
  });
  it("does NOT throw when an error-enforced field does not diverge", () => {
    const base = { minimumReleaseAge: 1440 };
    const manifest = { minimumReleaseAge: { strategy: "securityMin", enforcement: "error" as const } };
    expect(() => createHooks(base, manifest).updateConfig({ minimumReleaseAge: 2880 })).not.toThrow();
  });
  it("EnforcementError names the field and is identifiable by name", () => {
    try {
      createHooks({ strictDepBuilds: true }, { strictDepBuilds: { strategy: "securityFlag", enforcement: "error" as const } }).updateConfig({ strictDepBuilds: false });
    } catch (e) {
      expect((e as Error).name).toBe("EnforcementError");
      expect((e as Error).message).toContain("strictDepBuilds");
    }
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run package/__test__/runtime/enforcement.test.ts`
Expected: FAIL — `EnforcementError` not exported / no throw.

- [ ] **Step 3: Implement the throw**

In `package/src/runtime/enforcement.ts`:

```ts
/** Thrown when an `error`-enforced field diverges. Zero-dep plain Error subclass. @internal */
export class EnforcementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnforcementError";
  }
}
```

Update `applyEnforcement`: when `enforcement === "error"` and `result.divergences.length > 0`, `throw new EnforcementError(\`Field "${field}" is enforced (error) but the local config diverges: ${result.divergences.map((d) => d.setting).join(", ")}\`);` (replace the prior "behaves like warn" branch).

- [ ] **Step 4: Make the throw escape the M1 guard**

The shipped pnpmfile's `hooks.updateConfig` may be wrapped in a try/catch-and-fall-back-to-local guard (port of Silk `pnpmfile.ts:30-42`). M1's runtime did not have this guard inside `createHooks`; confirm where the guard lives. If `createHooks`'s `updateConfig` itself contains no swallow-guard, `EnforcementError` already propagates and Step 1's test passes — no change needed. If a guard exists (now or added later), it MUST rethrow `EnforcementError` (check `err instanceof EnforcementError` / `err.name === "EnforcementError"`) rather than fall back. Add a comment in `runtime/index.ts` documenting that `EnforcementError` is intended to fail the install and must never be swallowed.

- [ ] **Step 5: Run — verify pass**

Run: `pnpm exec vitest run package/__test__/runtime/enforcement.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package/src package/__test__
git commit -m "feat: error enforcement throws EnforcementError (escapes install guard)

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 6: `ctx` resolution + data-driven `excludeByRepo` refine

Port `resolveRootName` and model Silk's `WORKSPACE_LOCAL_HOISTS_BY_REPO` as a data-driven refine on `publicHoistPattern`.

**Files:**

- Create: `package/src/runtime/ctx.ts`
- Modify: `package/src/runtime/index.ts` (build ctx; apply refine), `package/src/registry.ts` (publicHoistPattern carries refine options), `package/src/plugin/freeze.ts` (pass refine options into manifest)
- Test: `package/__test__/runtime/ctx.test.ts`

**Interfaces:**

- Consumes: `RuntimeCtx`, `Manifest`, `PnpmConfig` (Task 1).
- Produces: `resolveRootName(config: PnpmConfig): string | undefined`; `excludeByRepo(merged: string[], ctx: RuntimeCtx, byRepo: Record<string, string[]>): string[]`.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/runtime/ctx.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { excludeByRepo, resolveRootName } from "../../src/runtime/ctx.js";

describe("resolveRootName", () => {
  it("prefers rootProjectManifest.name", () => {
    expect(resolveRootName({ rootProjectManifest: { name: "my-repo" } } as never)).toBe("my-repo");
  });
  it("returns undefined when no name resolvable", () => {
    expect(resolveRootName({ rootProjectManifestDir: "/nonexistent-xyz" } as never)).toBeUndefined();
  });
});

describe("excludeByRepo", () => {
  it("removes packages listed for the consuming repo", () => {
    const out = excludeByRepo(["@x/cli", "@x/mcp", "lodash"], { rootName: "my-repo" }, { "my-repo": ["@x/cli", "@x/mcp"] });
    expect(out).toEqual(["lodash"]);
  });
  it("passes through when the repo has no entry", () => {
    expect(excludeByRepo(["a", "b"], { rootName: "other" }, { "my-repo": ["a"] })).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run package/__test__/runtime/ctx.test.ts`
Expected: FAIL — `ctx.js` missing.

- [ ] **Step 3: Implement ctx + refine** (port `resolveRootName`, `update-config.ts:111-126`)

Create `package/src/runtime/ctx.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PnpmConfig, RuntimeCtx } from "./types.js";

/** Resolve the consuming repo's root package name. Ports Silk resolveRootName. @internal */
export function resolveRootName(config: PnpmConfig): string | undefined {
  const c = config as PnpmConfig & { rootProjectManifest?: { name?: string }; rootProjectManifestDir?: string; lockfileDir?: string; workspaceDir?: string; dir?: string };
  if (c.rootProjectManifest?.name) return c.rootProjectManifest.name;
  const rootDir = c.rootProjectManifestDir ?? c.lockfileDir ?? c.workspaceDir ?? c.dir ?? process.cwd();
  try {
    const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as { name?: string };
    return pkg.name;
  } catch {
    return undefined;
  }
}

/** Drop packages assigned to the consuming repo. Data-driven port of WORKSPACE_LOCAL_HOISTS_BY_REPO. @internal */
export function excludeByRepo(merged: string[], ctx: RuntimeCtx, byRepo: Record<string, string[]>): string[] {
  const exclude = ctx.rootName ? byRepo[ctx.rootName] : undefined;
  if (!exclude || exclude.length === 0) return merged;
  const set = new Set(exclude);
  return merged.filter((p) => !set.has(p));
}
```

- [ ] **Step 4: Wire ctx + refine into the runtime**

`package/src/runtime/index.ts`:

- Build `ctx` lazily once per `updateConfig`: `const ctx: RuntimeCtx = { rootName: resolveRootName(config) };` (replace the Task 1 `{ rootName: undefined }`).
- After a field's strategy runs, if `entry.options?.excludeByRepo` is present and the field is `publicHoistPattern`, apply `excludeByRepo(merged as string[], ctx, entry.options.excludeByRepo)` to the merged value before enforcement.

`package/src/registry.ts` — `publicHoistPattern` stays `arrayUnion`/`absent`; the refine data is supplied per-plugin via `definePlugin`, not the registry. Add to `freeze.ts`: when a field declaration includes refine options (e.g. `publicHoistPattern: { value: [...], excludeByRepo: {...} }`), copy them into `manifest[field].options`. Extend `normalizeField` to carry an optional `options` passthrough, OR (simpler) special-case `publicHoistPattern` in `freeze` to read an `excludeByRepo` sibling. Document the chosen shape in the commit.

- [ ] **Step 5: Run — verify pass**

Run: `pnpm exec vitest run package/__test__/runtime/ctx.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add package/src package/__test__
git commit -m "feat: ctx resolution + data-driven excludeByRepo hoist refine

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 7: Wire the full field set + runtime integration + example exercises everything

Validate every field through `freeze`/Schema, run a full synthetic config through `createHooks`, and make the example exercise all field kinds.

**Files:**

- Modify: `package/src/plugin/freeze.ts` (per-field Schema validation), `example/savvy.build.ts`
- Test: `package/__test__/runtime/integration.test.ts`, `package/__test__/plugin/freeze.test.ts` (extend), `example/__test__/build.e2e.test.ts` (extend)

**Interfaces:**

- Consumes: everything from Tasks 1–6.

- [ ] **Step 1: Write the runtime integration test**

Create `package/__test__/runtime/integration.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHooks } from "../../src/runtime/index.js";

const base = {
  catalogs: { silk: { typescript: "^5.9.0" } },
  overrides: { "tar@<1": ">=1" },
  strictDepBuilds: true,
  minimumReleaseAge: 1440,
  publicHoistPattern: ["@types/*"],
  confirmModulesPurge: true,
};
const manifest = {
  catalogs: { strategy: "catalogs", enforcement: "warn" as const },
  overrides: { strategy: "overrides", enforcement: "warn" as const },
  strictDepBuilds: { strategy: "securityFlag", enforcement: "warn" as const },
  minimumReleaseAge: { strategy: "securityMin", enforcement: "warn" as const },
  publicHoistPattern: { strategy: "arrayUnion", enforcement: "absent" as const },
  confirmModulesPurge: { strategy: "scalar", enforcement: "absent" as const },
};

afterEach(() => vi.restoreAllMocks());

describe("createHooks full integration", () => {
  it("merges all fields, child-wins, and warns on override + security loosening", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = createHooks(base, manifest).updateConfig({
      catalogs: { silk: { typescript: "5.0.0" } },
      strictDepBuilds: false,
      publicHoistPattern: ["lodash"],
    });
    expect(out.catalogs).toEqual({ silk: { typescript: "5.0.0" } });
    expect(out.strictDepBuilds).toBe(false);
    expect(out.publicHoistPattern).toEqual(["@types/*", "lodash"]);
    expect(out.confirmModulesPurge).toBe(true);
    const printed = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("SILK CATALOG OVERRIDE DETECTED");
    expect(printed).toContain("SILK SECURITY OVERRIDE DETECTED");
    expect(printed).toContain("strictDepBuilds");
  });
});
```

- [ ] **Step 2: Run — verify fail (or surface gaps)**

Run: `pnpm exec vitest run package/__test__/runtime/integration.test.ts`
Expected: FAIL initially if any wiring gap remains; fix until green.

- [ ] **Step 3: Add per-field Schema validation in `freeze`**

In `freeze.ts`, validate each field's value shape with an Effect `Schema` matching its type (catalogs: record-of-records; overrides/allowedDeprecatedVersions: record of string; allowBuilds: record of boolean; arrays: array of string; supportedArchitectures/auditConfig: record of string-array; scalars: boolean/number; peerDependencyRules: the struct). On failure, `ConfigError` with the field name. Validate only declared fields. (Transcribe the schemas; keep them minimal and field-keyed.)

- [ ] **Step 4: Make the example exercise all field kinds**

`example/savvy.build.ts` — expand the config:

```ts
const plugin = definePlugin({
  catalogs: defineCatalogs([{ name: "silk", peers: true, packages: { typescript: "^5.9.0", vitest: "^4.0.0" } }]),
  overrides: { "tar@<6.2.1": ">=6.2.1" },
  publicHoistPattern: ["@types/*"],
  allowBuilds: { esbuild: true },
  strictDepBuilds: true,
  minimumReleaseAge: { value: 1440, enforcement: "warn" },
  confirmModulesPurge: false,
});
```

`example/__test__/build.e2e.test.ts` — add an assertion that the built `pnpmfile.mjs` contains the manifest (`"strictDepBuilds"`) and that `createHooks(` receives two arguments.

- [ ] **Step 5: Full build + suite green**

Run: `pnpm exec vitest run` ; then `pnpm build` ; then `pnpm -C example types:check`
Expected: all green; dev+prod builds succeed; `grep -c 'from "effect"' example/dist/dev/pkg/pnpmfile.mjs` → `0`.

- [ ] **Step 6: Commit**

```bash
git add package/src package/__test__ example
git commit -m "feat: validate + wire full field set; runtime integration + example

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 8: API Extractor release tags + clean artifact

Resolve every `ae-*`/`tsdoc-*` diagnostic for the grown surface BEFORE the milestone closes (M1 taught us not to defer this). Decide `@public` vs `@internal` up front.

**Files:**

- Modify: TSDoc tags across `package/src/**` as needed; possibly `package/savvy.build.ts` for the runtime input-type warning.
- Test: the build's API Extractor pass.

**Public surface (`@public`):** `definePlugin`, `PluginConfig`, `FieldInput`, `defineCatalogs`, `CatalogInput`, `CatalogPackageSpec`, `CatalogsResult`, `PnpmConfigPlugin`, and the runtime `createHooks`, `PnpmConfig`, `PnpmHooks`.
**Internal (`@internal`):** all engine types (`Divergence`, `RuntimeCtx`, `StrategyResult`, `Strategy`, `Enforcement`, `ManifestEntry`, `Manifest`, `Base`), every strategy, `STRATEGY_TABLE`, `FIELD_REGISTRY`, `applyEnforcement`, `EnforcementError`, `resolveRootName`, `excludeByRepo`, the box formatters, `ConfigError`, `freeze`, `PluginDeps`, `createPnpmConfigPlugin`.

- [ ] **Step 1: Build and read diagnostics**

Run: `pnpm -C package build:prod`
Run: `python3 -c "import json; d=json.load(open('package/dist/prod/issues.json')); print('errors',len(d['errors']),'ciFatal',sum(1 for w in d['warnings'] if w.get('ciFatal')),'warnings',len(d['warnings'])); [print(w['code'],w['text'][:80]) for w in d['warnings']]"`
Expected: a list of `ae-missing-release-tag` (and possibly `ae-forgotten-export`) for the new symbols.

- [ ] **Step 2: Add release tags**

Add `@public`/`@internal` per the surface lists above to every flagged symbol. For any `ae-forgotten-export` (an exported public symbol referencing a non-exported type): ensure the public surface references only public types — engine/internal types must not appear in a `@public` signature. If one does, that's a design leak: fix by keeping the internal type out of the public signature (as M1 did with `createPnpmConfigPlugin`), not by making the internal type public.

- [ ] **Step 3: Address `ae-wrong-input-file-type` on the runtime**

The carry-forward warning targets the `./runtime` export pointing API Extractor at `.ts` source. If a clean fix exists (e.g. a `savvy.build.ts` adjustment for the secondary entry), apply it. If it requires bundler-config surgery beyond M2's scope, leave it and note it remains — it is non-fatal (0 errors / 0 ciFatal is the bar).

- [ ] **Step 4: Rebuild — confirm clean**

Run: `pnpm -C package build:prod`
Run: the issues.json check from Step 1.
Expected: `errors 0`, `ciFatal 0`. Ideally `warnings 0` (or only the documented `ae-wrong-input-file-type`).

Run: `pnpm exec vitest run` (full suite still green) ; `pnpm lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add package
git commit -m "docs: API Extractor release tags for the M2 strategy engine surface

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## Self-Review

- **Spec coverage:** strategy engine + detection/enforcement split (Task 1) ✓; all 10 strategies ported (Tasks 1–4) ✓; override + security boxes (Tasks 3–4) ✓; unified `warn|error|absent` incl. throw-escapes-guard (Tasks 1, 5) ✓; ctx + data-driven `excludeByRepo` refine (Task 6) ✓; ~12 fields wired + validated, example exercises them (Task 7) ✓; zero-dep runtime guard (Tasks 1, 7) ✓; API Extractor tags (Task 8 — added per advisor) ✓. Deferred-by-design: peer widening, arbitrary code injection, full Silk parity snapshots (M3).
- **Placeholder scan:** every code step has complete code; the two "transcribe from Silk verbatim" steps (the box formatters, per-field schemas) name the exact oracle file and the adaptation — they are ports of code present in this plan's source oracle, not placeholders.
- **Type consistency:** the locked engine contract (Task 1) is referenced verbatim by Tasks 2–8; `Strategy = (base, local, ctx) => StrategyResult` is used identically everywhere; `createHooks(base, manifest)`, `freeze → { base, manifest }`, `FieldInput<T>`, and `EnforcementError` names match across tasks.

---

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>
