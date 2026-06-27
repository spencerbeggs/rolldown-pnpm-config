# Phase A — API Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `defineCatalogs` + `definePlugin` into a single `PnpmConfigPlugin({...})` entry point with an inline catalog shape whose peer ranges are materialized in source (`{ range, peer, strategy }`), so the runtime reads peer ranges verbatim and never derives.

**Architecture:** `catalogs` moves from a `defineCatalogs(...)` return to an inline record keyed by catalog name. A new module (`catalogs.ts`) owns the catalog types and a pure `normalizeCatalogs` that builds the resolved `{ catalog → pkg → range }` map (base catalog from `range`/bare-string; `<name>Peers` catalog from packages carrying a materialized `peer`, used verbatim). `freeze.ts` calls `normalizeCatalogs` instead of reading `config.catalogs.catalogs`. The descriptor table, strategies, and serialize layer are unchanged. The CLI-only `derivePeerRange` helper that recomputes a peer range from a range + strategy is NOT part of this plan — it lands in Phase B with its first caller.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, Effect Schema, Vitest (forks pool), Biome.

## Global Constraints

- Relative imports MUST use `.js` extensions; Node built-ins MUST use `node:` protocol; type-only imports MUST use `import type`.
- No import cycles (Biome `noImportCycles` is an error).
- All tests live in `package/__test__/`, never in `src/`. Unit tests are `*.test.ts`; compile-time type tests are `*.test-d.ts`.
- The single public authoring entry point is `PnpmConfigPlugin({...})`. `defineCatalogs` and `definePlugin` are removed from the public API.
- `peers: true | false` does NOT exist. Peer ranges are **materialized** in source via the `peer` field. A `<name>Peers` catalog is generated iff a package carries a `peer`, and contains only those packages, using `peer` verbatim.
- **The runtime never derives peer ranges.** `strategy` is CLI-only metadata; the runtime ignores it. A package with `strategy` but no `peer` yields no peer entry.
- Commits require conventional-commit format + DCO signoff: `Signed-off-by: C. Spencer Beggs <spencer@beg.gs>`. Commit bodies must not contain markdown inline code (backticks) — the `silk/body-no-markdown` commitlint rule rejects them.
- Run a single test file with: `pnpm vitest run <path>`.

---

### Task 1: Catalog types + pure `normalizeCatalogs`

**Files:**

- Create: `package/src/catalogs.ts`
- Test: `package/__test__/catalogs/normalize-catalogs.test.ts`

**Interfaces:**

- Produces:
  - `type PeerStrategy = "lock" | "lock-minor"`
  - `type CatalogPackageSpec = string | { readonly range: string; readonly peer?: string; readonly strategy?: PeerStrategy }`
  - `interface CatalogDeclaration { readonly packages: Record<string, CatalogPackageSpec> }`
  - `function normalizeCatalogs(input: Record<string, CatalogDeclaration>): Record<string, Record<string, string>>` — pure (no Effect). Base catalog from `range`/bare-string; `<name>Peers` from packages carrying a materialized `peer`, verbatim; `strategy` ignored; `strategy`-without-`peer` yields no peer entry.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/catalogs/normalize-catalogs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeCatalogs } from "../../src/catalogs.js";

describe("normalizeCatalogs", () => {
 it("resolves bare and object specs to ranges in the base catalog", () => {
  const out = normalizeCatalogs({
   silk: { packages: { typescript: "^5.9.0", vitest: { range: "^4.0.0" } } },
  });
  expect(out.silk).toEqual({ typescript: "^5.9.0", vitest: "^4.0.0" });
 });

 it("omits the peers catalog when no package carries a materialized peer", () => {
  const out = normalizeCatalogs({ silk: { packages: { typescript: "^5.9.0" } } });
  expect(out.silkPeers).toBeUndefined();
 });

 it("uses the materialized peer verbatim and ignores strategy", () => {
  const out = normalizeCatalogs({
   silk: {
    packages: {
     typescript: "^5.9.0",
     vitest: { range: "^4.2.3", peer: "^4.2.0", strategy: "lock-minor" },
     effect: { range: "^3.2.0", peer: "^3.0.0" },
    },
   },
  });
  expect(out.silk).toEqual({ typescript: "^5.9.0", vitest: "^4.2.3", effect: "^3.2.0" });
  expect(out.silkPeers).toEqual({ vitest: "^4.2.0", effect: "^3.0.0" });
 });

 it("emits no peer entry for a package with strategy but no materialized peer", () => {
  const out = normalizeCatalogs({
   silk: { packages: { vitest: { range: "^4.2.3", strategy: "lock-minor" } } },
  });
  expect(out.silkPeers).toBeUndefined();
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/catalogs/normalize-catalogs.test.ts`
Expected: FAIL — cannot find module `../../src/catalogs.js`.

- [ ] **Step 3: Write minimal implementation**

Create `package/src/catalogs.ts`:

```ts
/**
 * How the `upgrade` CLI recomputes a materialized peer range when the package
 * range is bumped. CLI-only metadata; the runtime ignores it.
 *
 * @public
 */
export type PeerStrategy = "lock" | "lock-minor";

/**
 * A package's version: a bare range, or an object carrying a materialized peer
 * range (`peer`) and optional CLI recompute `strategy`.
 *
 * @public
 */
export type CatalogPackageSpec =
 | string
 | { readonly range: string; readonly peer?: string; readonly strategy?: PeerStrategy };

/**
 * One catalog's declaration: a map of package name to version spec.
 *
 * @public
 */
export interface CatalogDeclaration {
 /** Map of package name to version spec or range object. */
 readonly packages: Record<string, CatalogPackageSpec>;
}

/**
 * Normalize declarative catalog input into the resolved `{ catalog → pkg → range }`
 * map consumed by the runtime. Pure: the base catalog uses each package's
 * `range` (or bare string); a `<name>Peers` catalog is emitted only for packages
 * carrying a materialized `peer`, using that value verbatim. `strategy` is
 * CLI-only and ignored here.
 *
 * @internal
 */
export function normalizeCatalogs(
 input: Record<string, CatalogDeclaration>,
): Record<string, Record<string, string>> {
 const out: Record<string, Record<string, string>> = {};
 for (const [name, decl] of Object.entries(input)) {
  const base: Record<string, string> = {};
  const peers: Record<string, string> = {};
  for (const [pkg, spec] of Object.entries(decl.packages)) {
   base[pkg] = typeof spec === "string" ? spec : spec.range;
   if (typeof spec === "object" && spec.peer !== undefined) {
    peers[pkg] = spec.peer;
   }
  }
  out[name] = base;
  if (Object.keys(peers).length > 0) {
   out[`${name}Peers`] = peers;
  }
 }
 return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/catalogs/normalize-catalogs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/catalogs.ts package/__test__/catalogs/normalize-catalogs.test.ts
git commit -m "feat: add catalog types and pure normalizeCatalogs

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 2: Reshape `PluginConfig.catalogs` and wire `freeze.ts`

**Files:**

- Modify: `package/src/define-plugin.ts:1-3` and `:16-20` (catalogs field type + imports)
- Modify: `package/src/define-plugin.ts:275-283` (delete `definePlugin`)
- Modify: `package/src/plugin/freeze.ts:1-2`, `:54-62`
- Modify: `package/__test__/plugin/freeze.test.ts` (new catalogs shape)

**Interfaces:**

- Consumes: `normalizeCatalogs`, `CatalogDeclaration` (Task 1).
- Produces: `PluginConfig.catalogs: Record<string, CatalogDeclaration>` (was `CatalogsResult`). `definePlugin` no longer exists.

- [ ] **Step 1: Update the failing test first**

In `package/__test__/plugin/freeze.test.ts`, replace every `catalogs:` input that uses `defineCatalogs(...)` or `{ catalogs: {...} }` with the inline shape, e.g.:

```ts
// before: catalogs: defineCatalogs([{ name: "silk", packages: { typescript: "^5.9.0" } }])
// after:
catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
```

Add a test asserting a materialized peer catalog flows through freeze verbatim:

```ts
it("freezes a materialized peer catalog verbatim", async () => {
 const { base } = await Effect.runPromise(
  freeze({ catalogs: { silk: { packages: { vitest: { range: "^4.2.3", peer: "^4.2.0", strategy: "lock-minor" } } } } }),
 );
 expect(base.catalogs).toEqual({ silk: { vitest: "^4.2.3" }, silkPeers: { vitest: "^4.2.0" } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/plugin/freeze.test.ts`
Expected: FAIL — type/shape mismatch (`config.catalogs.catalogs` undefined) and `silkPeers` missing.

- [ ] **Step 3: Update the PluginConfig type**

In `package/src/define-plugin.ts`, replace the catalogs import (line 1) and field:

```ts
// line 1: replace the CatalogsResult import
import type { CatalogDeclaration } from "./catalogs.js";
```

```ts
// the catalogs field (was: readonly catalogs: CatalogsResult)
/** The catalogs to inject into pnpm config, keyed by catalog name. */
readonly catalogs: Record<string, CatalogDeclaration>;
```

Delete the `definePlugin` function (lines ~275–283):

```ts
// remove the entire `export function definePlugin(...) { return input; }` block
```

- [ ] **Step 4: Wire freeze to normalizeCatalogs**

In `package/src/plugin/freeze.ts`, add the import and replace the catalogs decode:

```ts
// add near the other imports
import { normalizeCatalogs } from "../catalogs.js";
```

```ts
// replace lines 58-61 (the `base.catalogs = yield* Schema.decodeUnknown(...)` block) with:
// catalogs is always present and special: normalize the inline declarations into
// the resolved map (incl. materialized peer catalogs), then validate the shape.
base.catalogs = yield* Schema.decodeUnknown(CatalogsSchema)(normalizeCatalogs(config.catalogs)).pipe(
 Effect.mapError((error) => new ConfigError({ message: `Invalid catalogs: ${String(error)}` })),
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/plugin/freeze.test.ts`
Expected: PASS, including the new peer-catalog assertion.

- [ ] **Step 6: Commit**

```bash
git add package/src/define-plugin.ts package/src/plugin/freeze.ts package/__test__/plugin/freeze.test.ts
git commit -m "feat: reshape PluginConfig.catalogs to inline declarations

Removes definePlugin; freeze normalizes inline catalog declarations and
emits materialized peer catalogs verbatim via normalizeCatalogs.

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 3: Public API surface — exports, delete old files, drift guard

**Files:**

- Modify: `package/src/index.ts`
- Delete: `package/src/define-catalogs.ts`
- Delete: `package/__test__/define-catalogs.test.ts`
- Delete: `package/__test__/define-plugin.test.ts`
- Modify: `package/__test__/types/plugin-config.test-d.ts`
- Modify: `package/__test__/plugin/plugin.test.ts` (input shape only)

**Interfaces:**

- Consumes: `catalogs.ts` types, `PluginConfig` (Task 2).
- Produces: public exports — `PnpmConfigPlugin`, `PluginConfig`, `FieldInput`, `Enforcement`, `CatalogPackageSpec`, `CatalogDeclaration`, `PeerStrategy`.

- [ ] **Step 1: Update the index exports**

Replace `package/src/index.ts` with:

```ts
export type { CatalogDeclaration, CatalogPackageSpec, PeerStrategy } from "./catalogs.js";
export type { FieldInput, PluginConfig } from "./define-plugin.js";
export { PnpmConfigPlugin } from "./plugin/index.js";
// `Enforcement` is reachable from the public `FieldInput`; export it from the
// main entry so API Extractor sees it (the runtime entry re-exports it too).
export type { Enforcement } from "./runtime/types.js";
```

- [ ] **Step 2: Delete the obsolete files**

```bash
git rm package/src/define-catalogs.ts \
  package/__test__/define-catalogs.test.ts \
  package/__test__/define-plugin.test.ts
```

- [ ] **Step 3: Update the compile-time drift guard**

In `package/__test__/types/plugin-config.test-d.ts`, update any `catalogs` literal to the inline shape and remove references to `CatalogsResult`/`defineCatalogs`/`definePlugin`. Example fixture value:

```ts
const config = {
 catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
} satisfies PluginConfig;
```

Keep the existing assertions that every descriptor field is present on `PluginConfig` — only the `catalogs` shape changes.

- [ ] **Step 4: Update plugin.test.ts input shape**

In `package/__test__/plugin/plugin.test.ts`, replace `catalogs:` inputs with the inline shape (same edit pattern as Task 2 Step 1). No assertion logic changes.

- [ ] **Step 5: Run the type check and the affected tests**

Run: `pnpm run typecheck`
Expected: PASS (no `CatalogsResult`/`definePlugin` references remain).

Run: `pnpm vitest run package/__test__/plugin/plugin.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package/src/index.ts package/__test__/types/plugin-config.test-d.ts package/__test__/plugin/plugin.test.ts
git commit -m "refactor: remove defineCatalogs/definePlugin from public API

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 4: Migrate consumers + parity harness + changeset

**Files:**

- Modify: `examples/savvy/savvy.build.ts`
- Modify: `examples/rolldown/pnpm-config.ts`
- Modify: `package/__test__/parity/silk.config.ts`
- Create: `.changeset/<descriptive-name>.md`

**Interfaces:**

- Consumes: `PnpmConfigPlugin` from `rolldown-pnpm-config` (final public surface).

- [ ] **Step 1: Migrate examples/savvy**

In `examples/savvy/savvy.build.ts`, replace the `definePlugin(...)` + `defineCatalogs(...)` block with a single `PnpmConfigPlugin({...})` call, using a materialized peer range:

```ts
import { defineBuild, runBuild } from "@savvy-web/bundler";
import { PnpmConfigPlugin } from "rolldown-pnpm-config";

const config = defineBuild({
 plugins: [
  PnpmConfigPlugin({
   catalogs: {
    silk: {
     packages: {
      typescript: { range: "^5.9.0", peer: "^5.9.0", strategy: "lock-minor" },
      vitest: "^4.0.0",
     },
    },
   },
   overrides: { "tar@<6.2.1": ">=6.2.1" },
   publicHoistPattern: ["@types/*"],
   allowBuilds: { esbuild: true },
   strictDepBuilds: true,
   minimumReleaseAge: { value: 1440, enforcement: "warn" },
   confirmModulesPurge: false,
  }),
 ],
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

- [ ] **Step 2: Migrate examples/rolldown**

Replace `examples/rolldown/pnpm-config.ts` with:

```ts
import { PnpmConfigPlugin } from "rolldown-pnpm-config";

export const plugin = PnpmConfigPlugin({
 catalogs: { default: { packages: { typescript: "^5.9.0", vitest: "^4.0.0" } } },
 overrides: { "tar@<6.2.1": ">=6.2.1" },
 publicHoistPattern: ["@types/*"],
 allowBuilds: { esbuild: true },
 strictDepBuilds: true,
 minimumReleaseAge: { value: 1440, enforcement: "warn" },
 confirmModulesPurge: false,
});
```

- [ ] **Step 3: Migrate the parity harness config**

In `package/__test__/parity/silk.config.ts`, convert the `catalogs` input to the inline shape (preserve the exact catalog names, package names, and ranges already present — only the wrapping changes from `defineCatalogs([{ name, packages }])` to `{ <name>: { packages } }`). If the old config relied on `peers: true`, replace each peer with a materialized `peer` range equal to the base range (the verbatim pass-through the old M1 produced). Remove the `defineCatalogs`/`definePlugin` imports.

- [ ] **Step 4: Run the full suite**

Run: `pnpm run typecheck && pnpm run test`
Expected: PASS — parity integration tests still match the Silk oracle (peer catalogs appear exactly where a materialized `peer` is declared).

- [ ] **Step 5: Build the examples to confirm the virtual module still emits**

Run: `pnpm run build`
Expected: PASS — `dist/` emits without errors; `rolldown-pnpm-config/virtual/catalogs` resolves.

- [ ] **Step 6: Write the changeset**

Create `.changeset/consolidate-plugin-api.md`:

```markdown
---
"rolldown-pnpm-config": minor
---

### Changed

- Consolidated the authoring API to a single `PnpmConfigPlugin({...})` entry
  point. `defineCatalogs` and `definePlugin` are removed; pass catalogs inline
  as `catalogs: { <name>: { packages: { ... } } }`.
- Replaced the catalog-level `peers: true` flag with a materialized per-package
  `peer` range plus an optional `strategy` (`"lock"` / `"lock-minor"`). Peer
  ranges now live in source verbatim; the build reads them as-is and never
  derives them. A `<name>Peers` catalog is generated only for packages that
  carry a `peer`, and contains only those packages.
```

- [ ] **Step 7: Validate the changeset and commit**

Run: `pnpm exec savvy changeset validate-file .changeset/consolidate-plugin-api.md`
Expected: no errors.

```bash
git add examples/savvy/savvy.build.ts examples/rolldown/pnpm-config.ts \
  package/__test__/parity/silk.config.ts .changeset/consolidate-plugin-api.md
git commit -m "refactor: migrate consumers to consolidated PnpmConfigPlugin API

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

## Self-Review

**Spec coverage:**

- API consolidation to single `PnpmConfigPlugin` → Tasks 2, 3, 4. ✓
- Inline keyed-object catalogs shape → Task 2. ✓
- `defineCatalogs`/`definePlugin` removed → Tasks 2, 3. ✓
- Materialized peer model (`peer` + optional `strategy`), `peers:true` removed → Tasks 1, 2. ✓
- Runtime reads `peer` verbatim, never derives; `strategy` ignored at runtime → Task 1. ✓
- Peer catalog = only packages carrying a materialized `peer` → Task 1. ✓
- `strategy` without `peer` → no runtime peer entry → Task 1. ✓
- Examples + parity migration + changeset → Task 4. ✓

**Not in this plan (Phase B, separate plan):** the `upgrade` CLI (`discover`/`resolve`/`plan`/walk/`rewrite`), oxc parsing, `pnpm view` resolution, Ink UI, the CLI-only `derivePeerRange(range, strategy)` helper (with its tests) for recomputing/rewriting `peer` literals, and drift detection. Phase B is where `derivePeerRange` lands, with the rewrite step as its first caller.

**Type consistency:** `CatalogDeclaration`, `CatalogPackageSpec`, `PeerStrategy`, `normalizeCatalogs` are defined in Task 1 and referenced with identical names/signatures in Tasks 2–3. `PluginConfig.catalogs: Record<string, CatalogDeclaration>` is consistent across freeze, index, and the type test. `normalizeCatalogs` is pure (returns the map directly); freeze passes its result straight into `Schema.decodeUnknown(CatalogsSchema)`.
