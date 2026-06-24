# rolldown-pnpm-config — Phase 1, Milestone 1 (Walking Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the end-to-end build path — a rolldown plugin that serves two virtual modules (`hooks` for the pnpmfile, `catalogs` as a `Map`) — proving every integration risk (dual resolution, isolated declarations, dual mjs/cjs, zero-dep runtime, memoization) on the real `@savvy-web/bundler` toolchain before any Silk merge logic is ported.

**Architecture:** `PnpmConfigPlugin` is a standard rolldown plugin passed to `defineBuild({ plugins: [...] })` (shipped in `@savvy-web/bundler@0.11.0`). It resolves two bare specifiers via `resolveId`→`\0`-prefixed ids and serves generated source from `load`. The shipped artifacts are a self-contained `pnpmfile.mjs`/`.cjs` (importing the zero-dep `createHooks` runtime) and a `.` entry exporting a frozen `catalogs` Map. The Effect validate/freeze step runs once at build time inside the plugin (memoized across passes) and never ships.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), Effect (build-time only, in the plugin), rolldown (plugin type), `@savvy-web/bundler@^0.11.0` (build), `@savvy-web/vitest` (tests, auto-discovers `package/__test__`), Node ≥24.11 (the repo runs `node savvy.build.ts` directly).

## Global Constraints

Every task implicitly includes these. Exact values:

- **Package name:** `rolldown-pnpm-config` (library lives in `package/`; consumer example in `example/`, named `pnpm-plugin-example`).
- **Virtual specifiers (exact strings):** `rolldown-pnpm-config/virtual/pnpmfile` (exports `hooks`) and `rolldown-pnpm-config/virtual/catalogs` (exports `catalogs`).
- **Runtime subpath:** `rolldown-pnpm-config/runtime` — exports `createHooks` + the `PnpmHooks`/`PnpmConfig`/`FrozenConfig` types. **Zero dependencies** — it must never import `effect` or anything else; the shipped `pnpmfile.mjs` must contain no `from "effect"`.
- **pnpm contract:** the pnpmfile entry exports a `hooks` const (NOT `export default`).
- **Catalogs export type:** `Map<string, Map<string, string>>` (catalog name → package → range).
- **Virtual-module module type (the central M1 fork — decided empirically in Task 1):** the plugin serves source from `load` under a `\0`-prefixed id. Rolldown infers module type from the id, and a `\0`-prefixed, extensionless id is parsed as **plain JS** — so the default is **plain-JS virtual source** (no type annotations, no `import type`), with types carried by the shipped ambient `.d.ts` via the exports `types` condition (the dual-resolution path). Annotations are only valid if Task 1 determines rolldown applies its TS transform to plugin-served virtual modules (via a `.ts`-suffixed virtual id or `load` returning `{ code, moduleType: "ts" }`). The catalogs `.` entry's dts pass and this module-type choice are **one fork**: plain-JS source only type-checks if the dts pass resolves the import via the ambient `.d.ts` rather than deriving types from the loaded source. Task 1 resolves and records which branch holds.
- **Determinism:** generated module source has recursively sorted object keys and stable formatting.
- **ESM:** relative imports use `.js` extensions; `node:` protocol for built-ins.
- **Tests:** live in `package/__test__/` mirroring `src/`; unit files are `*.test.ts`; import source via relative `../src/<x>.js`. Run with `pnpm exec vitest run <path>` from the repo root.
- **Commits:** Conventional Commits + DCO signoff `Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>`. Husky runs lint-staged (Biome + markdownlint) and pre-push tests.

---

## Scope: this plan is Milestone 1 only

Phase 1 has three milestones. **This plan covers M1 (the walking skeleton).** M2/M3 are intentionally NOT planned in detail yet because their emission specifics depend on what the skeleton empirically resolves (how the dts pass treats the virtual modules; exactly how isolated declarations constrains the generated literals). Outlines are at the end; each gets its own plan once M1 lands.

- **M1 (this plan):** plugin + two virtual modules + zero-dep runtime, scoped to **catalogs only**. `createHooks` does a catalog merge (child-wins, no warnings yet). End state: `example/` builds green (dev+prod), `tsgo` passes, both pnpmfile formats + the catalogs Map emit correctly, runtime is effect-free, freeze is memoized across passes.
- **M2 (next plan):** the full strategy engine + runtime ported from Silk (7 built-ins, registry, warnings, security detection, `refine`), the remaining ~12 fields, and peer-range widening. Driven by the §6.1 findings from M1.
- **M3 (next plan):** wire the full field set through the plugin and prove Silk parity via ported snapshots.

Spec: `.claude/design/rolldown-pnpm-config/phase1-design.md`. Silk behavioral oracle: `/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk`.

---

## File Structure (M1)

Created in `package/src/`:

- `runtime/index.ts` — zero-dep: `PnpmConfig`, `FrozenConfig`, `PnpmHooks` types + `createHooks`. One responsibility: the shipped install-time shim.
- `virtual/pnpmfile.d.ts` — ambient types for the `hooks` virtual specifier (the `exports["./virtual/pnpmfile"].types` target).
- `virtual/catalogs.d.ts` — ambient types for the `catalogs` virtual specifier.
- `plugin/index.ts` — `PnpmConfigPlugin` (the rolldown plugin: `resolveId`/`load`, memoized freeze).
- `plugin/freeze.ts` — Effect program: validate (Schema) + freeze → `FrozenConfig`. `ConfigError`.
- `plugin/serialize.ts` — `sortKeys`, `emitPnpmfileModule`, `emitCatalogsModule` (deterministic codegen).
- `define-catalogs.ts` — `defineCatalogs` (normalize; M1 peers = pass-through copy).
- `define-plugin.ts` — `definePlugin` + `PluginConfig`.
- `index.ts` — public exports: `PnpmConfigPlugin`, `definePlugin`, `defineCatalogs` (+ types).

Modified: `package/package.json` (exports, deps), `example/savvy.build.ts`, `example/src/pnpmfile.ts`, `example/src/index.ts`.

Tests in `package/__test__/`: `runtime/create-hooks.test.ts`, `define-catalogs.test.ts`, `define-plugin.test.ts`, `plugin/freeze.test.ts`, `plugin/serialize.test.ts`, `plugin/plugin.test.ts`.

---

### Task 1: Integration spike — green build with hardcoded virtual modules

The riskiest thing first. A plugin that serves **hardcoded but isolated-declaration-safe** source for both specifiers, a stub `createHooks` returning config unchanged, and `example/` building green end to end. No domain logic. If this is red, we learn it on day one.

**Files:**

- Create: `package/src/runtime/index.ts`
- Create: `package/src/virtual/pnpmfile.d.ts`
- Create: `package/src/virtual/catalogs.d.ts`
- Create: `package/src/plugin/index.ts`
- Modify: `package/src/index.ts`
- Modify: `package/package.json` (exports + add `rolldown` devDependency)
- Modify: `example/savvy.build.ts`, `example/src/pnpmfile.ts`, `example/src/index.ts`

**Interfaces:**

- Produces: `createHooks(frozen: FrozenConfig): PnpmHooks`; types `PnpmConfig { catalogs?: Record<string, Record<string,string>>; [k]: unknown }`, `FrozenConfig { catalogs: Record<string, Record<string,string>> }`, `PnpmHooks { updateConfig(config: PnpmConfig): PnpmConfig }`. `PnpmConfigPlugin(): import("rolldown").Plugin`.

- [ ] **Step 1: Add the runtime (stub `createHooks` + types)**

Create `package/src/runtime/index.ts`:

```ts
/** Minimal pnpm config shape — only the fields this plugin reads/writes. */
export interface PnpmConfig {
 catalogs?: Record<string, Record<string, string>>;
 [key: string]: unknown;
}

/** The frozen, build-time-resolved plugin data shipped into the pnpmfile. */
export interface FrozenConfig {
 catalogs: Record<string, Record<string, string>>;
}

/** The pnpm pnpmfile hooks object. */
export interface PnpmHooks {
 updateConfig(config: PnpmConfig): PnpmConfig;
}

/**
 * Build the pnpm hooks from frozen plugin data. Zero dependencies — this is
 * bundled verbatim into the shipped pnpmfile. M1 stub: returns config unchanged.
 */
export function createHooks(_frozen: FrozenConfig): PnpmHooks {
 return { updateConfig: (config) => config };
}
```

- [ ] **Step 2: Add ambient types for the two virtual specifiers**

Create `package/src/virtual/pnpmfile.d.ts`:

```ts
import type { PnpmHooks } from "../runtime/index.js";

export const hooks: PnpmHooks;
```

Create `package/src/virtual/catalogs.d.ts`:

```ts
export const catalogs: Map<string, Map<string, string>>;
```

- [ ] **Step 3: Add the plugin with hardcoded, isolated-declaration-safe source**

Create `package/src/plugin/index.ts`:

```ts
import type { Plugin } from "rolldown";

const PNPMFILE_SPEC = "rolldown-pnpm-config/virtual/pnpmfile";
const CATALOGS_SPEC = "rolldown-pnpm-config/virtual/catalogs";

// Default branch: PLAIN JS (a \0-prefixed extensionless id is parsed as JS — no
// TS annotations / `import type`). Types come from the shipped ambient .d.ts.
// If Task 1's build proves the dts pass derives types from this source instead
// of the ambient .d.ts, switch to the typed branch (see Step 12).
const PNPMFILE_SRC = `import { createHooks } from "rolldown-pnpm-config/runtime";
export const hooks = createHooks({ catalogs: {} });
`;

const CATALOGS_SRC = `export const catalogs = new Map([["silk", new Map([["example-pkg", "^1.0.0"]])]]);
`;

/** Rolldown plugin that serves the two virtual modules. M1 spike: hardcoded source. */
export function PnpmConfigPlugin(): Plugin {
 return {
  name: "rolldown-pnpm-config",
  resolveId(source) {
   if (source === PNPMFILE_SPEC || source === CATALOGS_SPEC) {
    return `\0${source}`;
   }
   return null;
  },
  load(id) {
   if (id === `\0${PNPMFILE_SPEC}`) return PNPMFILE_SRC;
   if (id === `\0${CATALOGS_SPEC}`) return CATALOGS_SRC;
   return null;
  },
 };
}
```

- [ ] **Step 4: Export the plugin**

Replace `package/src/index.ts` contents:

```ts
export { PnpmConfigPlugin } from "./plugin/index.js";
```

- [ ] **Step 5: Wire package.json exports + add rolldown**

In `package/package.json`, replace the `exports` block and add `rolldown` to `devDependencies`:

```json
 "exports": {
  ".": "./src/index.ts",
  "./runtime": "./src/runtime/index.ts",
  "./virtual/pnpmfile": { "types": "./src/virtual/pnpmfile.d.ts" },
  "./virtual/catalogs": { "types": "./src/virtual/catalogs.d.ts" },
  "./package.json": "./package.json"
 },
```

Then install rolldown (type-only; it resolves transitively via the bundler but declare it explicitly so `tsgo` in `package/` resolves the `Plugin` type):

Run: `pnpm -C package add -D rolldown`
Expected: `rolldown` added to `package/package.json` devDependencies; install succeeds.

- [ ] **Step 6: Wire the example entries and build config**

Replace `example/src/pnpmfile.ts`:

```ts
export { hooks } from "rolldown-pnpm-config/virtual/pnpmfile";
```

Replace `example/src/index.ts`:

```ts
export { catalogs } from "rolldown-pnpm-config/virtual/catalogs";
```

Replace `example/savvy.build.ts`:

```ts
import { defineBuild, runBuild } from "@savvy-web/bundler";
import { PnpmConfigPlugin } from "rolldown-pnpm-config";

const config = defineBuild({
 plugins: [PnpmConfigPlugin()],
 meta: false,
 bundleNodeModules: true,
 looseFiles: {
  "pnpmfile.mjs": "./src/pnpmfile.ts",
  "pnpmfile.cjs": "./src/pnpmfile.ts",
 },
});

export default config;

if (import.meta.main) {
 await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
}
```

- [ ] **Step 7: Reinstall so the workspace link + new exports resolve**

Run: `pnpm install`
Expected: completes; `node_modules` links `rolldown-pnpm-config` for the example.

- [ ] **Step 8: Build and verify both artifacts emit (the integration gate)**

Run: `pnpm -C package build:dev && pnpm -C example build:dev`
Expected: both builds succeed with no error. The package builds first deliberately — if `@savvy-web/bundler` derives a build entry from the types-only `./virtual/*` exports and fails on the missing JS source, drop those two `exports` entries and ship the ambient declarations instead via a bundled global `.d.ts` referenced in `example/tsconfig.json` (the same ambient fallback as Step 11); record which form worked.

Run: `ls example/dist/dev/pkg/pnpmfile.mjs example/dist/dev/pkg/pnpmfile.cjs`
Expected: both files exist.

- [ ] **Step 9: Verify the pnpmfile content + zero-dep guarantee**

Run: `grep -c 'createHooks' example/dist/dev/pkg/pnpmfile.mjs`
Expected: ≥ 1 (the runtime was bundled in).

Run: `grep -c 'from "effect"' example/dist/dev/pkg/pnpmfile.mjs`
Expected: `0` (no Effect in the shipped artifact).

- [ ] **Step 10: Verify the catalogs entry emitted the Map**

Run: `grep -rl 'new Map(' example/dist/dev/pkg`
Expected: lists the built `.`-entry file (e.g. `example/dist/dev/pkg/index.js`). Glob, not a parsed `exports["."]` — the built `exports["."]` is a conditional object (`{ types, import }`), so don't index it as a string.

- [ ] **Step 11: Verify the example type-checks (dual resolution works)**

Run: `pnpm -C example types:check`
Expected: passes (the ambient `.d.ts` resolve `hooks` and `catalogs`). If it fails because a types-only `exports` entry is rejected, add a sibling ambient fallback file `example/types/virtual.d.ts` with `declare module "rolldown-pnpm-config/virtual/pnpmfile" { import type { PnpmHooks } from "rolldown-pnpm-config/runtime"; export const hooks: PnpmHooks; }` and the matching `catalogs` block, and ensure `example/tsconfig.json` includes `types/`. This is the one place the dual-resolution approach is empirically confirmed — record which form worked in the commit message.

- [ ] **Step 12: Resolve the module-type / dts fork (the spike's core question)**

Run: `pnpm build`
Expected: dev + prod builds succeed for both packages with **plain-JS** virtual source.

This step decides the branch the rest of M1 (esp. Task 5) follows. Two outcomes:

- **Plain-JS branch (default, expected to win):** the build is green. The dts pass for the `.` entry resolved `catalogs`'s type via the ambient `./virtual/catalogs` `.d.ts` (not from the loaded source), so no annotation was needed. Keep plain-JS source everywhere. Record "plain-JS / ambient-dts" in the commit.
- **Typed-source branch (fallback):** prod fails with an isolated-declarations error on the `catalogs` entry (the dts pass derived types from the plain-JS `new Map(...)` and demanded an annotation). Then make rolldown transform the virtual modules as TS and annotate them:
  - In `package/src/plugin/index.ts`, change `resolveId` to return a `.ts`-suffixed virtual id (`return \`\0${source}.ts\`;`) and`load` to match on the `.ts`-suffixed id — OR return`{ code, moduleType: "ts" }` from `load`.
  - Restore the annotated source: `export const catalogs: Map<string, Map<string, string>> = new Map([...])` and, for the pnpmfile module, `import type { PnpmHooks } from "rolldown-pnpm-config/runtime"; export const hooks: PnpmHooks = createHooks({...})`.
  - Rebuild; confirm green. Record "typed-source / moduleType=ts" in the commit.

Whichever branch wins is the contract for Task 5's `emit*` functions. Note: the pnpmfile loose-files pass runs with `dts: false`, so only the `catalogs` `.` entry forces this decision.

- [ ] **Step 13: Commit**

```bash
git add package/src package/package.json example/savvy.build.ts example/src pnpm-lock.yaml
git commit -m "feat: walking-skeleton plugin with two virtual modules

Record in the body which virtual-types resolution form worked (exports types
vs ambient declare module).

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 2: Real `createHooks` — catalog merge (child wins)

Swap the stub for a real catalog merge. Pure runtime logic, fully unit-tested, no integration.

**Files:**

- Modify: `package/src/runtime/index.ts`
- Test: `package/__test__/runtime/create-hooks.test.ts`

**Interfaces:**

- Consumes: `FrozenConfig`, `PnpmConfig`, `PnpmHooks` (Task 1).
- Produces: `createHooks(frozen)` whose `updateConfig` merges each frozen catalog into `config.catalogs`, local entries winning per package.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/runtime/create-hooks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHooks } from "../../src/runtime/index.js";

describe("createHooks", () => {
 it("merges frozen catalogs into config; local entries win per package", () => {
  const hooks = createHooks({ catalogs: { silk: { a: "1.0.0", b: "2.0.0" } } });
  const result = hooks.updateConfig({ catalogs: { silk: { b: "9.9.9", c: "3.0.0" } } });
  expect(result.catalogs).toEqual({ silk: { a: "1.0.0", b: "9.9.9", c: "3.0.0" } });
 });

 it("adds a frozen catalog absent from local config", () => {
  const hooks = createHooks({ catalogs: { silk: { a: "1.0.0" } } });
  const result = hooks.updateConfig({});
  expect(result.catalogs).toEqual({ silk: { a: "1.0.0" } });
 });

 it("preserves unrelated config fields", () => {
  const hooks = createHooks({ catalogs: {} });
  const result = hooks.updateConfig({ minimumReleaseAge: 1440 });
  expect(result.minimumReleaseAge).toBe(1440);
 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run package/__test__/runtime/create-hooks.test.ts`
Expected: FAIL — the first test fails because the stub returns config unchanged (`catalogs.silk.a` is missing).

- [ ] **Step 3: Implement the merge**

Replace the `createHooks` function in `package/src/runtime/index.ts` (keep the types unchanged):

```ts
/**
 * Build the pnpm hooks from frozen plugin data. Zero dependencies — bundled
 * verbatim into the shipped pnpmfile. Merges each frozen catalog into the
 * consumer's config; a local entry for the same package wins.
 */
export function createHooks(frozen: FrozenConfig): PnpmHooks {
 return {
  updateConfig(config) {
   const existing = config.catalogs ?? {};
   const merged: Record<string, Record<string, string>> = { ...existing };
   for (const [name, entries] of Object.entries(frozen.catalogs)) {
    merged[name] = { ...entries, ...(existing[name] ?? {}) };
   }
   return { ...config, catalogs: merged };
  },
 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run package/__test__/runtime/create-hooks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/runtime/index.ts package/__test__/runtime/create-hooks.test.ts
git commit -m "feat: createHooks merges catalogs with local-wins precedence

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 3: `defineCatalogs`

Normalize the declarative catalog input into the frozen catalog record. M1: `peers: true` is a pass-through copy (range widening is deferred to M2).

**Files:**

- Create: `package/src/define-catalogs.ts`
- Modify: `package/src/index.ts`
- Test: `package/__test__/define-catalogs.test.ts`

**Interfaces:**

- Produces: types `CatalogPackageSpec = string | { range: string; peer?: "lock-to-minor" }`, `CatalogInput { name: string; peers?: boolean; packages: Record<string, CatalogPackageSpec> }`, `CatalogsResult { catalogs: Record<string, Record<string, string>> }`; function `defineCatalogs(inputs: readonly CatalogInput[]): CatalogsResult`.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/define-catalogs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defineCatalogs } from "../src/define-catalogs.js";

describe("defineCatalogs", () => {
 it("normalizes string and object package specs to ranges", () => {
  const result = defineCatalogs([
   { name: "silk", packages: { typescript: "^5.9.0", vitest: { range: "^4.0.0" } } },
  ]);
  expect(result.catalogs).toEqual({ silk: { typescript: "^5.9.0", vitest: "^4.0.0" } });
 });

 it("emits a pass-through <name>Peers copy when peers is true", () => {
  const result = defineCatalogs([
   { name: "silk", peers: true, packages: { typescript: "^5.9.0" } },
  ]);
  expect(result.catalogs.silkPeers).toEqual({ typescript: "^5.9.0" });
 });

 it("omits the peers catalog when peers is absent", () => {
  const result = defineCatalogs([{ name: "silk", packages: { a: "1.0.0" } }]);
  expect(result.catalogs.silkPeers).toBeUndefined();
 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run package/__test__/define-catalogs.test.ts`
Expected: FAIL with "Cannot find module '../src/define-catalogs.js'".

- [ ] **Step 3: Implement `defineCatalogs`**

Create `package/src/define-catalogs.ts`:

```ts
/** A package's version, as a bare range or an object (with optional peer mode). */
export type CatalogPackageSpec = string | { readonly range: string; readonly peer?: "lock-to-minor" };

/** One named catalog declaration. */
export interface CatalogInput {
 readonly name: string;
 /** When true, also emit a `<name>Peers` catalog. M1: a pass-through copy. */
 readonly peers?: boolean;
 readonly packages: Record<string, CatalogPackageSpec>;
}

/** Normalized catalogs: catalog name → package → resolved range. */
export interface CatalogsResult {
 readonly catalogs: Record<string, Record<string, string>>;
}

/**
 * Normalize declarative catalog input. M1: `peers: true` duplicates the base
 * ranges as `<name>Peers`; range widening (lock-to-minor) is deferred to M2.
 */
export function defineCatalogs(inputs: readonly CatalogInput[]): CatalogsResult {
 const catalogs: Record<string, Record<string, string>> = {};
 for (const input of inputs) {
  const entries: Record<string, string> = {};
  for (const [pkg, spec] of Object.entries(input.packages)) {
   entries[pkg] = typeof spec === "string" ? spec : spec.range;
  }
  catalogs[input.name] = entries;
  if (input.peers) {
   catalogs[`${input.name}Peers`] = { ...entries };
  }
 }
 return { catalogs };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run package/__test__/define-catalogs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Re-export from the public entry**

Update `package/src/index.ts`:

```ts
export { PnpmConfigPlugin } from "./plugin/index.js";
export { defineCatalogs } from "./define-catalogs.js";
export type { CatalogInput, CatalogPackageSpec, CatalogsResult } from "./define-catalogs.js";
```

- [ ] **Step 6: Commit**

```bash
git add package/src/define-catalogs.ts package/src/index.ts package/__test__/define-catalogs.test.ts
git commit -m "feat: defineCatalogs normalizes catalog input (peers pass-through in M1)

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 4: `definePlugin` + `freeze` (Effect + Schema)

`definePlugin` produces the typed config object; `freeze` is the Effect program that validates it (Schema) and produces the plain frozen data. Proves the "Effect runs at build time" pattern.

**Files:**

- Create: `package/src/define-plugin.ts`
- Create: `package/src/plugin/freeze.ts`
- Modify: `package/src/index.ts`, `package/package.json` (add `effect`)
- Test: `package/__test__/define-plugin.test.ts`, `package/__test__/plugin/freeze.test.ts`

**Interfaces:**

- Consumes: `CatalogsResult` (Task 3), `FrozenConfig` (Task 1).
- Produces: `PluginConfig { catalogs: CatalogsResult }`; `definePlugin(input: PluginConfig): PluginConfig`; `ConfigError` (tagged); `freeze(config: PluginConfig): Effect.Effect<FrozenConfig, ConfigError>`.

- [ ] **Step 1: Add the `effect` dependency**

Run: `pnpm -C package add effect`
Expected: `effect` added to `package/package.json` dependencies; install succeeds. (Effect is build-time only — used by the plugin, never bundled into a consumer's runtime.)

- [ ] **Step 2: Write the failing tests**

Create `package/__test__/define-plugin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defineCatalogs } from "../src/define-catalogs.js";
import { definePlugin } from "../src/define-plugin.js";

describe("definePlugin", () => {
 it("carries the catalogs through", () => {
  const catalogs = defineCatalogs([{ name: "silk", packages: { a: "1.0.0" } }]);
  const config = definePlugin({ catalogs });
  expect(config.catalogs).toBe(catalogs);
 });
});
```

Create `package/__test__/plugin/freeze.test.ts`:

```ts
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { defineCatalogs } from "../../src/define-catalogs.js";
import { definePlugin } from "../../src/define-plugin.js";
import { ConfigError, freeze } from "../../src/plugin/freeze.js";

describe("freeze", () => {
 it("produces frozen catalogs from a valid config", async () => {
  const config = definePlugin({ catalogs: defineCatalogs([{ name: "silk", packages: { a: "1.0.0" } }]) });
  const frozen = await Effect.runPromise(freeze(config));
  expect(frozen).toEqual({ catalogs: { silk: { a: "1.0.0" } } });
 });

 it("fails with ConfigError when catalogs are malformed", async () => {
  const bad = { catalogs: { catalogs: { silk: { a: 123 } } } } as unknown as Parameters<typeof freeze>[0];
  const exit = await Effect.runPromiseExit(freeze(bad));
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
   const err = exit.cause;
   expect(String(err)).toContain("ConfigError");
  }
 });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run package/__test__/define-plugin.test.ts package/__test__/plugin/freeze.test.ts`
Expected: FAIL with "Cannot find module" for `define-plugin.js` / `freeze.js`.

- [ ] **Step 4: Implement `definePlugin`**

Create `package/src/define-plugin.ts`:

```ts
import type { CatalogsResult } from "./define-catalogs.js";

/** The declarative plugin configuration. M1: catalogs only. */
export interface PluginConfig {
 readonly catalogs: CatalogsResult;
}

/** Identity-with-types builder for the plugin configuration. */
export function definePlugin(input: PluginConfig): PluginConfig {
 return { catalogs: input.catalogs };
}
```

- [ ] **Step 5: Implement `freeze`**

Create `package/src/plugin/freeze.ts`:

```ts
import { Data, Effect, Schema } from "effect";
import type { PluginConfig } from "../define-plugin.js";
import type { FrozenConfig } from "../runtime/index.js";

/** Typed failure for invalid plugin configuration, surfaced as a build error. */
export class ConfigError extends Data.TaggedError("ConfigError")<{ readonly message: string }> {}

const CatalogsSchema = Schema.Record({
 key: Schema.String,
 value: Schema.Record({ key: Schema.String, value: Schema.String }),
});

/**
 * Validate and freeze the plugin config into plain data. The only place Effect
 * runs; invoked once at build time inside the plugin.
 */
export function freeze(config: PluginConfig): Effect.Effect<FrozenConfig, ConfigError> {
 return Effect.gen(function* () {
  const catalogs = yield* Schema.decodeUnknown(CatalogsSchema)(config.catalogs.catalogs).pipe(
   Effect.mapError((error) => new ConfigError({ message: `Invalid catalogs: ${String(error)}` })),
  );
  return { catalogs };
 });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run package/__test__/define-plugin.test.ts package/__test__/plugin/freeze.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Re-export `definePlugin`**

Update `package/src/index.ts` to add:

```ts
export { definePlugin } from "./define-plugin.js";
export type { PluginConfig } from "./define-plugin.js";
```

- [ ] **Step 8: Commit**

```bash
git add package/src/define-plugin.ts package/src/plugin/freeze.ts package/src/index.ts package/package.json pnpm-lock.yaml package/__test__/define-plugin.test.ts package/__test__/plugin/freeze.test.ts
git commit -m "feat: definePlugin + Effect freeze with schema validation

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 5: Serialization — `sortKeys` + deterministic module emit

Generate the virtual-module source strings deterministically. **Emit the form Task 1 chose** — the code and test below are the **plain-JS** branch (default). If Task 1 recorded "typed-source / moduleType=ts", re-add the annotations: `export const catalogs: Map<string, Map<string, string>> = new Map(...)` and, in the pnpmfile module, an `import type { PnpmHooks } from "rolldown-pnpm-config/runtime";` line plus `export const hooks: PnpmHooks = ...` — and update the test's expected strings to match.

**Files:**

- Create: `package/src/plugin/serialize.ts`
- Test: `package/__test__/plugin/serialize.test.ts`

**Interfaces:**

- Produces: `sortKeys(value: unknown): unknown`; `emitPnpmfileModule(frozen: FrozenConfig): string`; `emitCatalogsModule(catalogs: Record<string, Record<string, string>>): string`.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/plugin/serialize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emitCatalogsModule, emitPnpmfileModule, sortKeys } from "../../src/plugin/serialize.js";

describe("sortKeys", () => {
 it("recursively sorts object keys; arrays keep order", () => {
  expect(sortKeys({ b: 1, a: { d: 2, c: 3 } })).toEqual({ a: { c: 3, d: 2 }, b: 1 });
  expect(sortKeys([3, 1, 2])).toEqual([3, 1, 2]);
 });
});

describe("emitCatalogsModule", () => {
 it("emits a sorted Map literal (plain-JS branch)", () => {
  const src = emitCatalogsModule({ silkPeers: { z: "2" }, silk: { b: "1", a: "9" } });
  expect(src).toBe(
   'export const catalogs = new Map([["silk", new Map([["a", "9"], ["b", "1"]])], ["silkPeers", new Map([["z", "2"]])]]);\n',
  );
 });
});

describe("emitPnpmfileModule", () => {
 it("emits createHooks wiring over the frozen data (plain-JS branch)", () => {
  const src = emitPnpmfileModule({ catalogs: { silk: { a: "1" } } });
  expect(src).toContain('import { createHooks } from "rolldown-pnpm-config/runtime";');
  expect(src).not.toContain("import type");
  expect(src).toContain('export const hooks = createHooks({"catalogs":{"silk":{"a":"1"}}});');
 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run package/__test__/plugin/serialize.test.ts`
Expected: FAIL with "Cannot find module '../../src/plugin/serialize.js'".

- [ ] **Step 3: Implement the serializers**

Create `package/src/plugin/serialize.ts`:

```ts
import type { FrozenConfig } from "../runtime/index.js";

/** Recursively sort object keys for deterministic output; arrays keep order. */
export function sortKeys(value: unknown): unknown {
 if (Array.isArray(value)) {
  return value.map(sortKeys);
 }
 if (value !== null && typeof value === "object") {
  return Object.fromEntries(
   Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, sortKeys(v)]),
  );
 }
 return value;
}

/** Source for the `catalogs` virtual module: a sorted Map literal (plain-JS branch). */
export function emitCatalogsModule(catalogs: Record<string, Record<string, string>>): string {
 const sorted = sortKeys(catalogs) as Record<string, Record<string, string>>;
 const outer = Object.entries(sorted)
  .map(([name, entries]) => {
   const inner = Object.entries(entries)
    .map(([pkg, range]) => `[${JSON.stringify(pkg)}, ${JSON.stringify(range)}]`)
    .join(", ");
   return `[${JSON.stringify(name)}, new Map([${inner}])]`;
  })
  .join(", ");
 return `export const catalogs = new Map([${outer}]);\n`;
}

/** Source for the `pnpmfile` virtual module: createHooks over the frozen data. */
export function emitPnpmfileModule(frozen: FrozenConfig): string {
 const data = JSON.stringify(sortKeys(frozen));
 return [
  'import { createHooks } from "rolldown-pnpm-config/runtime";',
  `export const hooks = createHooks(${data});`,
  "",
 ].join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run package/__test__/plugin/serialize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/plugin/serialize.ts package/__test__/plugin/serialize.test.ts
git commit -m "feat: deterministic virtual-module serialization

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 6: Wire `freeze` + serialize into the plugin (memoized), drive the real example

Replace the hardcoded plugin source with real, config-driven output; memoize `freeze` so it runs **once** across the bundler's four passes; switch the example to a real `definePlugin(defineCatalogs(...))` config. Keeps the repo green per commit.

**Files:**

- Modify: `package/src/plugin/index.ts`
- Modify: `example/savvy.build.ts`
- Test: `package/__test__/plugin/plugin.test.ts`

**Interfaces:**

- Consumes: `PluginConfig` (Task 4), `freeze`/`ConfigError` (Task 4), `emitPnpmfileModule`/`emitCatalogsModule` (Task 5), `FrozenConfig` (Task 1).
- Produces: `PnpmConfigPlugin(config: PluginConfig, deps?: { freeze: typeof freeze }): Plugin`. The signature now **requires** `config`. `deps` is an internal seam for testing memoization.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/plugin/plugin.test.ts`:

```ts
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { defineCatalogs } from "../../src/define-catalogs.js";
import { definePlugin } from "../../src/define-plugin.js";
import { PnpmConfigPlugin } from "../../src/plugin/index.js";

const config = definePlugin({ catalogs: defineCatalogs([{ name: "silk", peers: true, packages: { a: "^1.0.0" } }]) });

// rolldown hooks can be a function or an object { handler }; normalize for tests.
const callHook = <T>(hook: unknown, ...args: unknown[]): T => {
 const fn = typeof hook === "function" ? hook : (hook as { handler: (...a: unknown[]) => T }).handler;
 return (fn as (...a: unknown[]) => T).apply({}, args);
};

describe("PnpmConfigPlugin", () => {
 it("resolves the two virtual specifiers to \\0-prefixed ids and nothing else", () => {
  const plugin = PnpmConfigPlugin(config);
  expect(callHook<string | null>(plugin.resolveId, "rolldown-pnpm-config/virtual/pnpmfile")).toBe(
   "\0rolldown-pnpm-config/virtual/pnpmfile",
  );
  expect(callHook<string | null>(plugin.resolveId, "rolldown-pnpm-config/virtual/catalogs")).toBe(
   "\0rolldown-pnpm-config/virtual/catalogs",
  );
  expect(callHook<string | null>(plugin.resolveId, "some-other-package")).toBeNull();
 });

 it("loads the catalogs module as a Map reflecting the config (incl. peers copy)", async () => {
  const plugin = PnpmConfigPlugin(config);
  const src = await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/catalogs");
  expect(src).toContain('["silk", new Map([["a", "^1.0.0"]])]');
  expect(src).toContain('["silkPeers", new Map([["a", "^1.0.0"]])]');
 });

 it("runs freeze exactly once across multiple load calls (memoized across passes)", async () => {
  const freezeSpy = vi.fn((c: typeof config) => Effect.succeed({ catalogs: c.catalogs.catalogs }));
  const plugin = PnpmConfigPlugin(config, { freeze: freezeSpy });
  await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/pnpmfile");
  await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/catalogs");
  await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/pnpmfile");
  expect(freezeSpy).toHaveBeenCalledTimes(1);
 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run package/__test__/plugin/plugin.test.ts`
Expected: FAIL — the current `PnpmConfigPlugin()` takes no args and serves hardcoded source (the memoization and config-reflection assertions fail).

- [ ] **Step 3: Implement the real plugin**

Replace `package/src/plugin/index.ts`:

```ts
import { Effect } from "effect";
import type { Plugin } from "rolldown";
import type { PluginConfig } from "../define-plugin.js";
import type { FrozenConfig } from "../runtime/index.js";
import { type ConfigError, freeze } from "./freeze.js";
import { emitCatalogsModule, emitPnpmfileModule } from "./serialize.js";

const PNPMFILE_SPEC = "rolldown-pnpm-config/virtual/pnpmfile";
const CATALOGS_SPEC = "rolldown-pnpm-config/virtual/catalogs";

/** Internal seam: lets tests inject a freeze spy to assert single-evaluation. */
export interface PluginDeps {
 readonly freeze: (config: PluginConfig) => Effect.Effect<FrozenConfig, ConfigError>;
}

/**
 * Rolldown plugin serving the two virtual modules. The Effect freeze runs once
 * (memoized) and is reused across every tsdown pass (JS, dts, declarations,
 * looseFiles).
 */
export function PnpmConfigPlugin(config: PluginConfig, deps: PluginDeps = { freeze }): Plugin {
 let frozen: Promise<FrozenConfig> | undefined;
 const getFrozen = (): Promise<FrozenConfig> => (frozen ??= Effect.runPromise(deps.freeze(config)));

 return {
  name: "rolldown-pnpm-config",
  resolveId(source) {
   if (source === PNPMFILE_SPEC || source === CATALOGS_SPEC) {
    return `\0${source}`;
   }
   return null;
  },
  async load(id) {
   if (id === `\0${PNPMFILE_SPEC}`) {
    return emitPnpmfileModule(await getFrozen());
   }
   if (id === `\0${CATALOGS_SPEC}`) {
    return emitCatalogsModule((await getFrozen()).catalogs);
   }
   return null;
  },
 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run package/__test__/plugin/plugin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Switch the example to a real config**

Replace the top of `example/savvy.build.ts` (imports + config construction):

```ts
import { defineBuild, runBuild } from "@savvy-web/bundler";
import { defineCatalogs, definePlugin, PnpmConfigPlugin } from "rolldown-pnpm-config";

const plugin = definePlugin({
 catalogs: defineCatalogs([
  { name: "silk", peers: true, packages: { typescript: "^5.9.0", vitest: "^4.0.0" } },
 ]),
});

const config = defineBuild({
 plugins: [PnpmConfigPlugin(plugin)],
 meta: false,
 bundleNodeModules: true,
 looseFiles: {
  "pnpmfile.mjs": "./src/pnpmfile.ts",
  "pnpmfile.cjs": "./src/pnpmfile.ts",
 },
});

export default config;

if (import.meta.main) {
 await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
}
```

- [ ] **Step 6: Rebuild the example to confirm it stays green with real config**

Run: `pnpm -C package build:dev && pnpm -C example build:dev`
Expected: both succeed.

Run: `grep -c 'createHooks({"catalogs":{"silk"' example/dist/dev/pkg/pnpmfile.mjs`
Expected: ≥ 1 (the frozen catalogs are inlined).

- [ ] **Step 7: Commit**

```bash
git add package/src/plugin/index.ts example/savvy.build.ts package/__test__/plugin/plugin.test.ts
git commit -m "feat: config-driven plugin with memoized freeze across passes

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

### Task 7: End-to-end verification + lint/typecheck gate

Final M1 gate: full build (dev+prod), example type-check, catalogs entry reflects the real config, zero-dep guarantee holds, lint clean.

**Files:**

- Test: `example/__test__/build.e2e.test.ts`

**Interfaces:**

- Consumes: the built artifacts under `example/dist/`.

- [ ] **Step 1: Write the failing e2e test**

Create `example/__test__/build.e2e.test.ts` (e2e kind by filename; reads already-built artifacts — run after a build):

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = join(import.meta.dirname, "..", "dist", "dev", "pkg");

/** Find the built `.`-entry source by content — `exports["."]` is a conditional object, not a string. */
const readCatalogsEntry = (): string => {
 for (const name of readdirSync(pkgDir)) {
  if (!name.endsWith(".js")) continue;
  const src = readFileSync(join(pkgDir, name), "utf8");
  if (src.includes("new Map(")) return src;
 }
 throw new Error("no built entry containing `new Map(` found in dist/dev/pkg");
};

describe("example build artifacts", () => {
 it("emits a self-contained pnpmfile.mjs with createHooks and no effect import", () => {
  const src = readFileSync(join(pkgDir, "pnpmfile.mjs"), "utf8");
  expect(src).toContain("createHooks");
  expect(src).not.toContain('from "effect"');
 });

 it("emits a pnpmfile.cjs", () => {
  expect(() => readFileSync(join(pkgDir, "pnpmfile.cjs"), "utf8")).not.toThrow();
 });

 it("emits a catalogs Map reflecting the configured packages", () => {
  const indexSrc = readCatalogsEntry();
  expect(indexSrc).toContain("new Map(");
  expect(indexSrc).toContain("typescript");
  expect(indexSrc).toContain("silkPeers");
 });
});
```

- [ ] **Step 2: Run a full build so artifacts exist**

Run: `pnpm build`
Expected: dev + prod builds succeed for both packages (this is the isolated-declarations gate; if the `catalogs` entry's dts pass errors, apply the branch Task 1 Step 12 recorded before continuing).

- [ ] **Step 3: Run the e2e test to verify it passes**

Run: `pnpm exec vitest run example/__test__/build.e2e.test.ts`
Expected: PASS (3 tests).

(If it had been run before Step 2, it would FAIL with ENOENT — that is the intended red.)

- [ ] **Step 4: Type-check the example (dual resolution)**

Run: `pnpm -C example types:check`
Expected: passes.

- [ ] **Step 5: Full lint + test sweep**

Run: `pnpm lint && pnpm test`
Expected: Biome clean; all unit tests + the e2e test pass.

- [ ] **Step 6: Commit**

```bash
git add example/__test__/build.e2e.test.ts
git commit -m "test: end-to-end build artifact verification for the example

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>"
```

---

## After M1: outlines for the next plans (do NOT implement here)

**M2 — strategy engine + runtime port (own plan, written after M1 lands).** Port Silk's 7 merge functions into named strategies (`scalar`, `mapChildWins`, `arrayUnion`, `arrayRecordUnion`, `catalog`, `overrides`, `peerDependencyRules`), the field registry, warning/security detection, and `refine`. Add the remaining ~12 fields to `definePlugin`/`freeze` and the manifest. Resolve peer-range widening (the `lock-to-minor` semantics are still open in the spec — pin them here). Extend `createHooks` to drive the manifest. Source map: spec §10.

**M3 — Silk parity (own plan).** Re-express Silk as a config on the library, port Silk's integration snapshots, and assert byte-identical merge behavior. Decide proof location (fixture in `example/` vs. wiring the real Silk repo) at the start of that plan.

Why outlines only: M2/M3 emission details depend on what M1 empirically establishes about the dts pass and isolated declarations (spec §6.1). Planning them now would bake in unverified assumptions.

---

## Self-Review

- **Spec coverage (M1 scope):** package surfaces + two virtual specifiers (Tasks 1,3,4,6) ✓; zero-dep runtime + guard (Tasks 1,2,7) ✓; `definePlugin`/`defineCatalogs` (Tasks 3,4) ✓; Effect-at-build-time freeze + ConfigError (Task 4) ✓; deterministic serialization (Task 5) ✓; memoization across passes (Task 6, explicit test) ✓; isolated-declaration-safe + dual resolution (Tasks 1,7, prod build) ✓; catalogs Map export (Tasks 1,6,7) ✓. Deferred-by-design and documented: widening, full field set, strategy engine, Silk parity (M2/M3).
- **Placeholder scan:** every code step has complete code; the one empirical branch (Task 1 Step 11 types resolution) gives both concrete forms and a recorded decision, not a TODO.
- **Type consistency:** `FrozenConfig { catalogs }`, `PluginConfig { catalogs: CatalogsResult }`, `createHooks(FrozenConfig)`, `freeze(PluginConfig): Effect<FrozenConfig, ConfigError>`, `PnpmConfigPlugin(PluginConfig, deps?)`, `emitCatalogsModule(Record<string,Record<string,string>>)`, `emitPnpmfileModule(FrozenConfig)` — names/signatures match across Tasks 1–7. Plugin signature change (no-arg → `PluginConfig`) happens in Task 6 together with the example rewire, keeping each commit green.

---

Signed-off-by: C. Spencer Beggs <spencer@savvyweb.systems>
