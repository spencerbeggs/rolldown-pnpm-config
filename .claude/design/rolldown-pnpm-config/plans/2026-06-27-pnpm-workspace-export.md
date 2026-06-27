# pnpm-workspace.yaml Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `rolldown-pnpm-config export [path]` command that statically materializes the `PnpmConfigPlugin` config into the local `pnpm-workspace.yaml` (plugin-authoritative overlay; no registry; no enforcement).

**Architecture:** Reuse the `upgrade` CLI's static-no-execution approach and the engine's `freeze`. New pure units evaluate the config literal (`evaluate`), apply the export-only `local` overlay, filter to `workspaceYaml`-valid fields, overlay the managed values onto the parsed `pnpm-workspace.yaml` (`workspace-overlay`), and render via `yaml` (`workspace-file`). A thin `@effect/cli` `export` command wires them, with `--preview`. The one engine change is a `workspaceYaml` flag on every descriptor and the additive `local` input key.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, `@effect/cli`, `oxc-parser`, `yaml`, Effect Schema, Vitest, Biome.

## Global Constraints

- Relative imports MUST use `.js` extensions; Node built-ins MUST use `node:` protocol; type-only imports MUST use `import type`. SEPARATE type/value imports (the project's `useImportType` enforces this — do not merge `import { x, type Y }`). No import cycles.
- `exactOptionalPropertyTypes` is ON: never pass `undefined` to an optional property — omit it. Run the FULL `pnpm run typecheck` (tsgo) to verify; the test suite alone does not catch these (build:dev transpiles without them).
- All tests live under `package/__test__/`. CLI tests under `package/__test__/cli/`; descriptor tests under `package/__test__/descriptors/`.
- `export` writes only descriptor fields flagged `workspaceYaml: true`. The plugin is authoritative for managed fields (overwrite); unknown keys (`packages`, `configDependencies`, auth, local-only catalogs) are PRESERVED; nothing is deleted. Catalogs overlay BY NAME (plugin names replace; local names preserved).
- `export` performs NO version resolution and NO strategy-merge/enforcement (those are the `upgrade` command's and the install-time pnpmfile's jobs).
- The `local` key is export-only: the build / shipped pnpmfile ignores it.
- YAML output uses `yaml`'s `stringify` with `{ indent: 2, lineWidth: 0, singleQuote: false }` plus a deterministic key sort. Comments are not preserved (the project's `lint:fmt` normalizes the file).
- `rolldown-pnpm-config` stays standalone — do NOT add a dependency on `@savvy-web/silk-effects`.
- Commits require conventional-commit format + DCO signoff: `Signed-off-by: C. Spencer Beggs <spencer@beg.gs>`. Commit bodies must NOT contain markdown inline code (backticks) — the `silk/body-no-markdown` commitlint rule rejects them.
- Run a single test file with: `pnpm vitest run <path>`.

## Reused interfaces (do not redefine)

- `discoverCatalogEntries` and `findConfigFiles` / `pickConfigCandidate` (from the `upgrade` CLI under `package/src/cli/`) — config-module discovery.
- `freeze(config): Effect<{ base: Base; manifest: Manifest }, ConfigError>` (`package/src/plugin/freeze.ts`). `Base = Record<string, unknown>` with `catalogs?: Record<string, Record<string, string>>`.
- `DESCRIPTORS` and `FieldDescriptor` (`package/src/descriptors/`).
- `PluginConfig` (`package/src/define-plugin.ts`).
- `oxc-parser` `parseSync(filename, source)` → `{ program, errors }`; nodes are ESTree-ish with `type`, numeric `start`/`end`; string/number/boolean literals are `Literal` with `.value`; objects are `ObjectExpression` with `.properties` (each a `Property` with `.key`/`.value`); arrays are `ArrayExpression` with `.elements`.

---

### Task 1: `evaluate.ts` — statically evaluate the PnpmConfigPlugin config literal

**Files:**

- Create: `package/src/cli/evaluate.ts`
- Test: `package/__test__/cli/evaluate.test.ts`

**Interfaces:**

- Produces: `function evaluatePluginConfig(source: string, filename: string): { config: Record<string, unknown> | null; errors: string[] }` — oxc-parse, find the single `PnpmConfigPlugin(...)` call, evaluate its first argument (an object literal) into a plain JS object. Literals (string/number/boolean/null), arrays, and nested objects evaluate; any other node (identifier, spread, template, call, computed key) appends a path-qualified message to `errors` and is omitted from the result. `config` is null when there is no `PnpmConfigPlugin` call.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/cli/evaluate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluatePluginConfig } from "../../src/cli/evaluate.js";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 local: { publicHoistPattern: ["@override/*"] },
 catalogs: { silk: { packages: { typescript: { range: "^5.9.0", peer: "^5.9.0", strategy: "lock-minor" } } } },
 overrides: { "tar@<6.2.1": ">=6.2.1" },
 publicHoistPattern: ["@types/*"],
 strictDepBuilds: true,
 minimumReleaseAge: { value: 1440, enforcement: "warn" },
 confirmModulesPurge: false,
});
`;

describe("evaluatePluginConfig", () => {
 it("evaluates a literal config into a plain object", () => {
  const { config, errors } = evaluatePluginConfig(SOURCE, "savvy.build.ts");
  expect(errors).toEqual([]);
  expect(config).toEqual({
   local: { publicHoistPattern: ["@override/*"] },
   catalogs: { silk: { packages: { typescript: { range: "^5.9.0", peer: "^5.9.0", strategy: "lock-minor" } } } },
   overrides: { "tar@<6.2.1": ">=6.2.1" },
   publicHoistPattern: ["@types/*"],
   strictDepBuilds: true,
   minimumReleaseAge: { value: 1440, enforcement: "warn" },
   confirmModulesPurge: false,
  });
 });

 it("reports a computed value as an error and omits it", () => {
  const src = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
const x = ["@types/*"];
export const p = PnpmConfigPlugin({ catalogs: {}, publicHoistPattern: x });`;
  const { config, errors } = evaluatePluginConfig(src, "x.ts");
  expect(config).toMatchObject({ catalogs: {} });
  expect((config as Record<string, unknown>).publicHoistPattern).toBeUndefined();
  expect(errors.some((e) => e.includes("publicHoistPattern"))).toBe(true);
 });

 it("returns null config when there is no PnpmConfigPlugin call", () => {
  const { config } = evaluatePluginConfig("export const x = 1;", "x.ts");
  expect(config).toBeNull();
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/evaluate.test.ts`
Expected: FAIL — cannot find module `../../src/cli/evaluate.js`.

- [ ] **Step 3: Implement `evaluate.ts`**

Create `package/src/cli/evaluate.ts`:

```ts
import { parseSync } from "oxc-parser";

type Node = { readonly type: string; readonly [k: string]: unknown };

/** Find the first `PnpmConfigPlugin(...)` call's first argument (an object literal). */
function findPluginArg(program: unknown): Node | undefined {
 let found: Node | undefined;
 const visit = (node: unknown): void => {
  if (found || node === null || typeof node !== "object") return;
  const n = node as Node;
  if (n.type === "CallExpression") {
   const callee = n.callee as Node | undefined;
   if (callee?.type === "Identifier" && callee.name === "PnpmConfigPlugin") {
    const args = n.arguments as Node[];
    if (args?.[0]?.type === "ObjectExpression") {
     found = args[0];
     return;
    }
   }
  }
  for (const value of Object.values(n)) {
   if (Array.isArray(value)) value.forEach(visit);
   else if (value && typeof value === "object") visit(value);
  }
 };
 visit(program);
 return found;
}

/** Evaluate a literal AST node into a plain JS value; unsupported nodes push to `errors`. */
function evalNode(node: Node, path: string, errors: string[]): unknown {
 switch (node.type) {
  case "Literal":
   return node.value;
  case "ArrayExpression": {
   const out: unknown[] = [];
   for (const [i, el] of ((node.elements as Node[]) ?? []).entries()) {
    if (el === null) {
     errors.push(`${path}[${i}]: holes are not supported`);
     continue;
    }
    out.push(evalNode(el, `${path}[${i}]`, errors));
   }
   return out;
  }
  case "ObjectExpression": {
   const out: Record<string, unknown> = {};
   for (const prop of (node.properties as Node[]) ?? []) {
    if (prop.type !== "Property") {
     errors.push(`${path}: spread/getter is not supported`);
     continue;
    }
    const key = prop.key as Node;
    const name = key.type === "Identifier" ? (key.name as string) : key.type === "Literal" ? String(key.value) : undefined;
    if (name === undefined) {
     errors.push(`${path}: computed key is not supported`);
     continue;
    }
    const value = evalNode(prop.value as Node, `${path}.${name}`, errors);
    if (value !== undefined) out[name] = value;
   }
   return out;
  }
  default:
   errors.push(`${path}: ${node.type} is not a literal; inline a concrete value`);
   return undefined;
 }
}

/**
 * Statically evaluate the single `PnpmConfigPlugin(...)` call's object-literal
 * argument into a plain config object. No module execution. Non-literal values
 * are reported in `errors` and omitted; `config` is null when no call is found.
 *
 * @internal
 */
export function evaluatePluginConfig(
 source: string,
 filename: string,
): { config: Record<string, unknown> | null; errors: string[] } {
 const errors: string[] = [];
 const result = parseSync(filename, source);
 if (result.errors.length > 0) {
  return { config: null, errors: result.errors.map((e) => e.message) };
 }
 const arg = findPluginArg(result.program);
 if (!arg) return { config: null, errors };
 const config = evalNode(arg, "config", errors) as Record<string, unknown>;
 return { config, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/evaluate.test.ts`
Expected: PASS (3 tests). If oxc node shapes differ (e.g. `StringLiteral` instead of `Literal`), adjust the `type`/field access to match what `parseSync` returns — verify once by logging `result.program` for the fixture, then delete the log. (The `upgrade` CLI's `discover.ts` confirmed `Literal`/`Property`/`ObjectExpression`/`ArrayExpression` for this oxc version.)

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/evaluate.ts package/__test__/cli/evaluate.test.ts
git commit -m "feat: statically evaluate the plugin config literal

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 2: `workspaceYaml` descriptor flag + classification + completeness test

**Files:**

- Modify: `package/src/descriptors/types.ts` (add the flag to `FieldDescriptor`)
- Modify: all 8 category files — `package/src/descriptors/{resolution,hoisting,lockfile,build,runtime-cfg,workspace,misc,network}.ts`
- Modify: `package/__test__/descriptors/table.test.ts` (completeness + sanity test)

**Interfaces:**

- Produces: `FieldDescriptor.workspaceYaml: boolean` on every descriptor entry. `true` = the field is valid in `pnpm-workspace.yaml` and is exportable; `false` = config-only (skipped by `export`).

- [ ] **Step 1: Add the failing completeness test**

In `package/__test__/descriptors/table.test.ts`, inside the per-field `describe(field, ...)` loop, add:

```ts
   it("declares workspaceYaml as a boolean", () => {
    expect(typeof desc.workspaceYaml).toBe("boolean");
   });
```

And add a sanity block after the loop (asserting the seed classification):

```ts
 it("classifies known fields correctly", () => {
  expect(DESCRIPTORS.confirmModulesPurge.workspaceYaml).toBe(false);
  expect(DESCRIPTORS.catalogs.workspaceYaml).toBe(true);
  expect(DESCRIPTORS.publicHoistPattern.workspaceYaml).toBe(true);
  expect(DESCRIPTORS.overrides.workspaceYaml).toBe(true);
 });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/descriptors/table.test.ts`
Expected: FAIL — `desc.workspaceYaml` is `undefined` (type and values not yet added).

- [ ] **Step 3: Add the field to the descriptor type**

In `package/src/descriptors/types.ts`, add to the `FieldDescriptor` interface (after `doc`):

```ts
 /** Whether this field is valid in pnpm-workspace.yaml (and thus exportable). */
 readonly workspaceYaml: boolean;
```

- [ ] **Step 4: Classify every entry**

Add `workspaceYaml: <true|false>` to each entry across the 8 category files. Classification rule (verify against pnpm's `pnpm-workspace.yaml` settings schema, <https://pnpm.io/settings>):

- **`true`** for every documented pnpm setting that lives in `pnpm-workspace.yaml`. The vast majority qualify — in pnpm 10 the workspace file is the consolidated home for settings. Use the descriptor's `anchor` as the primary signal: an entry WITH an `anchor` links to a documented pnpm setting and is almost always `workspaceYaml: true`. `catalogs` is `true`.
- **`false`** for config-only / undocumented fields. The known seed is `confirmModulesPurge` (its doc says "undocumented upstream"; it has no `anchor`). Check every entry that lacks an `anchor` (or whose `doc` notes it is undocumented/runtime-only) against the pnpm settings page; mark `false` only those confirmed absent from the workspace-file schema. When in doubt for an anchored, documented setting, prefer `true`.

Work file-by-file; after each file, the LSP/Biome will confirm no type error (the field is now required).

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm vitest run package/__test__/descriptors/table.test.ts`
Expected: PASS — every field declares `workspaceYaml`, and the sanity block passes.

Run: `pnpm run typecheck`
Expected: PASS (the required field is set on all entries).

- [ ] **Step 6: Commit**

```bash
git add package/src/descriptors/ package/__test__/descriptors/table.test.ts
git commit -m "feat: add workspaceYaml validity flag to the descriptor table

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 3: `local-overlay.ts` + `workspace-overlay.ts` — the pure merge rules

**Files:**

- Create: `package/src/cli/local-overlay.ts`
- Create: `package/src/cli/workspace-overlay.ts`
- Test: `package/__test__/cli/local-overlay.test.ts`
- Test: `package/__test__/cli/workspace-overlay.test.ts`

**Interfaces:**

- Produces:
  - `function applyLocal(config: Record<string, unknown>): Record<string, unknown>` — returns a copy of `config` with the `local` object's fields shallow-overlaid (each field replaces the corresponding top-level field) and the `local` key removed.
  - `function overlayWorkspace(managed: Record<string, unknown>, parsed: Record<string, unknown>): Record<string, unknown>` — overlay `managed` onto `parsed`: for `catalogs`, replace by catalog name and keep names not in `managed.catalogs`; for every other key in `managed`, overwrite; preserve all other keys in `parsed`; delete nothing.

- [ ] **Step 1: Write the failing tests**

Create `package/__test__/cli/local-overlay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyLocal } from "../../src/cli/local-overlay.js";

describe("applyLocal", () => {
 it("overlays local fields and strips the local key", () => {
  const out = applyLocal({
   catalogs: { silk: { packages: {} } },
   publicHoistPattern: ["@types/*"],
   local: { publicHoistPattern: ["@override/*"] },
  });
  expect(out).toEqual({ catalogs: { silk: { packages: {} } }, publicHoistPattern: ["@override/*"] });
  expect("local" in out).toBe(false);
 });

 it("is a no-op when there is no local key", () => {
  expect(applyLocal({ publicHoistPattern: ["@types/*"] })).toEqual({ publicHoistPattern: ["@types/*"] });
 });
});
```

Create `package/__test__/cli/workspace-overlay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { overlayWorkspace } from "../../src/cli/workspace-overlay.js";

describe("overlayWorkspace", () => {
 it("overwrites managed fields and preserves unknown keys", () => {
  const merged = overlayWorkspace(
   { publicHoistPattern: ["@types/*"], overrides: { "tar@<6.2.1": ">=6.2.1" } },
   { packages: ["pkg/*"], publicHoistPattern: ["@old/*"], configDependencies: { x: "1.0.0" } },
  );
  expect(merged).toEqual({
   packages: ["pkg/*"],
   publicHoistPattern: ["@types/*"],
   overrides: { "tar@<6.2.1": ">=6.2.1" },
   configDependencies: { x: "1.0.0" },
  });
 });

 it("overlays catalogs by name and preserves local catalogs", () => {
  const merged = overlayWorkspace(
   { catalogs: { silk: { typescript: "^5.9.0" } } },
   { catalogs: { silk: { typescript: "^5.0.0", extra: "^1.0.0" }, tsdown: { tsdown: "^2.0.0" } } },
  );
  expect(merged).toEqual({
   catalogs: { silk: { typescript: "^5.9.0" }, tsdown: { tsdown: "^2.0.0" } },
  });
 });

 it("never deletes a key the plugin does not declare", () => {
  const merged = overlayWorkspace({ publicHoistPattern: ["@types/*"] }, { autoInstallPeers: true });
  expect(merged.autoInstallPeers).toBe(true);
 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run package/__test__/cli/local-overlay.test.ts package/__test__/cli/workspace-overlay.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `local-overlay.ts`**

Create `package/src/cli/local-overlay.ts`:

```ts
/**
 * Apply the export-only `local` overlay: each field on `config.local` replaces
 * the corresponding top-level field, and the `local` key is removed. Shallow
 * per-field replace; pure.
 *
 * @internal
 */
export function applyLocal(config: Record<string, unknown>): Record<string, unknown> {
 const { local, ...rest } = config;
 if (local && typeof local === "object") {
  return { ...rest, ...(local as Record<string, unknown>) };
 }
 return { ...rest };
}
```

- [ ] **Step 4: Implement `workspace-overlay.ts`**

Create `package/src/cli/workspace-overlay.ts`:

```ts
/**
 * Overlay the plugin's managed fields onto a parsed pnpm-workspace.yaml object.
 * Managed top-level fields overwrite; `catalogs` is overlaid by catalog name
 * (plugin names replace, local names are preserved); every other key in the
 * parsed file is kept verbatim. Nothing is deleted. Pure.
 *
 * @internal
 */
export function overlayWorkspace(
 managed: Record<string, unknown>,
 parsed: Record<string, unknown>,
): Record<string, unknown> {
 const out: Record<string, unknown> = { ...parsed };
 for (const [key, value] of Object.entries(managed)) {
  if (key === "catalogs" && value && typeof value === "object") {
   const existing = (parsed.catalogs && typeof parsed.catalogs === "object" ? parsed.catalogs : {}) as Record<
    string,
    unknown
   >;
   out.catalogs = { ...existing, ...(value as Record<string, unknown>) };
  } else {
   out[key] = value;
  }
 }
 return out;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run package/__test__/cli/local-overlay.test.ts package/__test__/cli/workspace-overlay.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/local-overlay.ts package/src/cli/workspace-overlay.ts package/__test__/cli/local-overlay.test.ts package/__test__/cli/workspace-overlay.test.ts
git commit -m "feat: add local and workspace overlay merge helpers

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 4: `workspace-file.ts` — find, parse, render pnpm-workspace.yaml

**Files:**

- Modify: `package/package.json` (add `yaml` dependency)
- Create: `package/src/cli/workspace-file.ts`
- Test: `package/__test__/cli/workspace-file.test.ts`

**Interfaces:**

- Produces:
  - `function findWorkspaceFile(startDir: string): string | null` — walk up from `startDir` returning the first ancestor containing a `pnpm-workspace.yaml`, else null.
  - `function parseWorkspace(source: string): Record<string, unknown>` — `yaml.parse`; an empty/whitespace source returns `{}`.
  - `function renderWorkspace(obj: Record<string, unknown>): string` — deterministic key sort + `yaml.stringify` with `{ indent: 2, lineWidth: 0, singleQuote: false }`.

- [ ] **Step 1: Add the `yaml` dependency**

Add `yaml` to `package/package.json` `dependencies` (concrete caret at the latest stable, e.g. `^2.9.0` — confirm with `pnpm view yaml version`). Then:

```bash
pnpm install
ls node_modules/.pnpm | grep -E "^yaml@" | head
```

- [ ] **Step 2: Write the failing test**

Create `package/__test__/cli/workspace-file.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findWorkspaceFile, parseWorkspace, renderWorkspace } from "../../src/cli/workspace-file.js";

describe("workspace-file", () => {
 it("walks up to find pnpm-workspace.yaml", () => {
  const root = mkdtempSync(join(tmpdir(), "rpc-ws-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - pkg/*\n", "utf8");
  const sub = join(root, "a", "b");
  mkdirSync(sub, { recursive: true });
  expect(findWorkspaceFile(sub)).toBe(join(root, "pnpm-workspace.yaml"));
  expect(findWorkspaceFile(mkdtempSync(join(tmpdir(), "rpc-none-")))).toBeNull();
 });

 it("parses and renders deterministically and idempotently", () => {
  const parsed = parseWorkspace("publicHoistPattern:\n  - \"@types/*\"\npackages:\n  - pkg/*\n");
  expect(parsed).toEqual({ publicHoistPattern: ["@types/*"], packages: ["pkg/*"] });
  const once = renderWorkspace(parsed);
  expect(renderWorkspace(parseWorkspace(once))).toBe(once); // idempotent
  expect(parseWorkspace("")).toEqual({});
 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/workspace-file.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `workspace-file.ts`**

Create `package/src/cli/workspace-file.ts`:

```ts
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";

const FILENAME = "pnpm-workspace.yaml";
const STRINGIFY_OPTIONS = { indent: 2, lineWidth: 0, singleQuote: false } as const;

/** Recursively sort object keys for deterministic output; arrays keep order. */
function sortKeys(value: unknown): unknown {
 if (Array.isArray(value)) return value.map(sortKeys);
 if (value !== null && typeof value === "object") {
  return Object.fromEntries(
   Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, sortKeys(v)]),
  );
 }
 return value;
}

/**
 * Walk up from `startDir` to the nearest directory containing a
 * pnpm-workspace.yaml; returns the file path or null.
 *
 * @internal
 */
export function findWorkspaceFile(startDir: string): string | null {
 let dir = startDir;
 for (;;) {
  const candidate = join(dir, FILENAME);
  if (existsSync(candidate)) return candidate;
  const parent = dirname(dir);
  if (parent === dir) return null;
  dir = parent;
 }
}

/** Parse pnpm-workspace.yaml source; empty/whitespace yields an empty object. @internal */
export function parseWorkspace(source: string): Record<string, unknown> {
 const parsed = parse(source) as unknown;
 return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

/** Render a workspace object: deterministic key sort + yaml.stringify. @internal */
export function renderWorkspace(obj: Record<string, unknown>): string {
 return stringify(sortKeys(obj), STRINGIFY_OPTIONS);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/workspace-file.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package/package.json pnpm-lock.yaml package/src/cli/workspace-file.ts package/__test__/cli/workspace-file.test.ts
git commit -m "feat: add pnpm-workspace.yaml find/parse/render helpers

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 5: `export` command core + CLI wiring + integration

**Files:**

- Create: `package/src/cli/commands/export.ts`
- Modify: `package/src/cli/bin.ts` (register the `export` subcommand)
- Modify: `package/src/cli/index.ts` (barrel re-export)
- Test: `package/__test__/cli/export.int.test.ts`

**Interfaces:**

- Consumes: `evaluatePluginConfig` (Task 1), the `workspaceYaml` flag + `DESCRIPTORS` (Task 2), `applyLocal`/`overlayWorkspace` (Task 3), `findWorkspaceFile`/`parseWorkspace`/`renderWorkspace` (Task 4), `freeze` (engine), `findConfigFiles`/`pickConfigCandidate` (upgrade CLI).
- Produces:
  - `class ExportError extends Data.TaggedError("ExportError")<{ readonly message: string }>`
  - `function runExport(opts: { configFile: string; workspacePath?: string; preview: boolean }): Effect.Effect<{ path: string; rendered: string; written: boolean }, ExportError>` — the testable core.
  - `const WORKSPACE_FIELDS: ReadonlySet<string>` — descriptor names with `workspaceYaml: true`.
  - `const exportCommand` — the `@effect/cli` command.

- [ ] **Step 1: Write the failing integration test**

Create `package/__test__/cli/export.int.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { runExport } from "../../src/cli/commands/export.js";

const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 local: { publicHoistPattern: ["@override/*"] },
 catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
 overrides: { "tar@<6.2.1": ">=6.2.1" },
 publicHoistPattern: ["@types/*"],
 strictDepBuilds: true,
 confirmModulesPurge: false,
});
`;

function setup(workspaceContent?: string): { dir: string; configFile: string; workspacePath: string } {
 const dir = mkdtempSync(join(tmpdir(), "rpc-export-"));
 const configFile = join(dir, "savvy.build.ts");
 writeFileSync(configFile, CONFIG, "utf8");
 const workspacePath = join(dir, "pnpm-workspace.yaml");
 if (workspaceContent !== undefined) writeFileSync(workspacePath, workspaceContent, "utf8");
 return { dir, configFile, workspacePath };
}

describe("runExport", () => {
 it("overlays managed fields, applies local, preserves unknown, drops config-only", async () => {
  const { configFile, workspacePath } = setup(
   "packages:\n  - pkg/*\ncatalogs:\n  tsdown:\n    tsdown: \"^2.0.0\"\nautoInstallPeers: true\n",
  );
  const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: false }));
  const out = parse(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
  expect(res.written).toBe(true);
  expect(out.packages).toEqual(["pkg/*"]); // preserved
  expect(out.autoInstallPeers).toBe(true); // preserved
  expect(out.publicHoistPattern).toEqual(["@override/*"]); // local override applied
  expect(out.overrides).toEqual({ "tar@<6.2.1": ">=6.2.1" });
  expect((out.catalogs as Record<string, unknown>).silk).toEqual({ typescript: "^5.9.0" }); // plugin catalog
  expect((out.catalogs as Record<string, unknown>).tsdown).toEqual({ tsdown: "^2.0.0" }); // local catalog kept
  expect("confirmModulesPurge" in out).toBe(false); // config-only, dropped
 });

 it("creates a fresh file when none exists", async () => {
  const { configFile, workspacePath } = setup();
  const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: false }));
  expect(res.written).toBe(true);
  const out = parse(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
  expect((out.catalogs as Record<string, unknown>).silk).toEqual({ typescript: "^5.9.0" });
 });

 it("--preview writes nothing", async () => {
  const { configFile, workspacePath } = setup("packages:\n  - pkg/*\n");
  const before = readFileSync(workspacePath, "utf8");
  const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: true }));
  expect(res.written).toBe(false);
  expect(res.rendered).toContain("publicHoistPattern");
  expect(readFileSync(workspacePath, "utf8")).toBe(before);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/export.int.test.ts`
Expected: FAIL — cannot find module `../../src/cli/commands/export.js`.

- [ ] **Step 3: Implement `commands/export.ts`**

Create `package/src/cli/commands/export.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Args, Command, Options } from "@effect/cli";
import { Data, Effect, Option } from "effect";
import { DESCRIPTORS } from "../../descriptors/index.js";
import { freeze } from "../../plugin/freeze.js";
import { evaluatePluginConfig } from "../evaluate.js";
import { applyLocal } from "../local-overlay.js";
import { findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { findWorkspaceFile, parseWorkspace, renderWorkspace } from "../workspace-file.js";
import { overlayWorkspace } from "../workspace-overlay.js";

/**
 * Typed failure for the export command.
 *
 * @internal
 */
export class ExportError extends Data.TaggedError("ExportError")<{ readonly message: string }> {}

/** Descriptor field names valid in pnpm-workspace.yaml. */
export const WORKSPACE_FIELDS: ReadonlySet<string> = new Set(
 Object.entries(DESCRIPTORS)
  .filter(([, d]) => d.workspaceYaml)
  .map(([k]) => k),
);

/**
 * Export core: evaluate the config, apply `local`, freeze, filter to
 * workspace-valid fields, overlay onto the target pnpm-workspace.yaml, render,
 * and write (unless `preview`). Returns the resolved path and rendered output.
 *
 * @internal
 */
export function runExport(opts: {
 configFile: string;
 workspacePath?: string;
 preview: boolean;
}): Effect.Effect<{ path: string; rendered: string; written: boolean }, ExportError> {
 return Effect.gen(function* () {
  const configSource = yield* Effect.try({
   try: () => readFileSync(opts.configFile, "utf8"),
   catch: () => new ExportError({ message: `Cannot read ${opts.configFile}` }),
  });
  const { config, errors } = evaluatePluginConfig(configSource, opts.configFile);
  if (config === null) {
   return yield* Effect.fail(new ExportError({ message: `No PnpmConfigPlugin call found in ${opts.configFile}` }));
  }
  if (errors.length > 0) {
   return yield* Effect.fail(new ExportError({ message: `Non-literal config values: ${errors.join("; ")}` }));
  }
  const effective = applyLocal(config);
  const { base } = yield* freeze(effective as never).pipe(
   Effect.mapError((e) => new ExportError({ message: e.message })),
  );
  const managed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
   if (WORKSPACE_FIELDS.has(k)) managed[k] = v;
  }

  const path =
   opts.workspacePath ?? findWorkspaceFile(process.cwd()) ?? `${process.cwd()}/pnpm-workspace.yaml`;
  const parsed = existsSync(path) ? parseWorkspace(readFileSync(path, "utf8")) : {};
  const merged = overlayWorkspace(managed, parsed);
  const rendered = renderWorkspace(merged);

  if (opts.preview) return { path, rendered, written: false };
  yield* Effect.try({
   try: () => writeFileSync(path, rendered, "utf8"),
   catch: () => new ExportError({ message: `Cannot write ${path}` }),
  });
  return { path, rendered, written: true };
 });
}

const pathArg = Args.file({ name: "path" }).pipe(Args.optional);
const previewFlag = Options.boolean("preview").pipe(Options.withDefault(false));

/**
 * The `export` command: materialize the plugin config into the local
 * pnpm-workspace.yaml. Discovers the config module in cwd.
 *
 * @internal
 */
export const exportCommand = Command.make("export", { path: pathArg, preview: previewFlag }, ({ path, preview }) =>
 Effect.gen(function* () {
  const matches = findConfigFiles(process.cwd());
  const picked = pickConfigCandidate(matches);
  if (!picked.ok) return yield* Effect.fail(new ExportError({ message: picked.message }));
  const workspacePath = Option.getOrUndefined(path);
  const result = yield* runExport({
   configFile: picked.file,
   ...(workspacePath !== undefined ? { workspacePath } : {}),
   preview,
  });
  yield* Effect.sync(() => {
   if (preview) process.stdout.write(`${result.rendered}\n`);
   else process.stdout.write(`Exported to ${result.path}\n`);
  });
 }),
).pipe(Command.withDescription("Export the plugin config into pnpm-workspace.yaml"));
```

- [ ] **Step 4: Run the integration test**

Run: `pnpm vitest run package/__test__/cli/export.int.test.ts`
Expected: PASS (3 tests) — managed overlay + local + preserve + drop config-only; create-new; preview-no-write.

- [ ] **Step 5: Register the subcommand + barrel**

In `package/src/cli/bin.ts`, import `exportCommand` and add it to the root command's subcommands list alongside `upgradeCommand`:

```ts
import { exportCommand } from "./commands/export.js";
// ...
const root = Command.make("rolldown-pnpm-config").pipe(Command.withSubcommands([upgradeCommand, exportCommand]));
```

In `package/src/cli/index.ts`, add a barrel re-export:

```ts
export { exportCommand, runExport } from "./commands/export.js";
```

- [ ] **Step 6: Full verification**

Run: `pnpm run typecheck`
Expected: PASS (full tsgo, exactOptionalPropertyTypes).

Run: `pnpm run test`
Expected: PASS (full suite incl. the new export tests). If the v8 coverage gate breaches because of the command shell, lower the thresholds in `vitest.config.ts` to the floor of achieved coverage (only if it actually fails); otherwise leave it.

Run: `pnpm run build`
Expected: PASS (dev+prod).

- [ ] **Step 7: Commit**

```bash
git add package/src/cli/commands/export.ts package/src/cli/bin.ts package/src/cli/index.ts package/__test__/cli/export.int.test.ts
git commit -m "feat: add the export command and CLI wiring

Adds rolldown-pnpm-config export, which materializes the plugin config into
the local pnpm-workspace.yaml: static config evaluation, local overlay,
freeze reuse, workspaceYaml filtering, by-name catalog overlay preserving
unknown keys, and a preview mode.

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 6: Changeset + docs

**Files:**

- Create: `.changeset/<descriptive-name>.md`
- Modify: `package/README.md` (a short export mention) and/or `docs/05-upgrading-catalogs.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/pnpm-workspace-export.md`:

```markdown
---
"rolldown-pnpm-config": minor
---

## Features

Added a `rolldown-pnpm-config export [path]` command that materializes the
plugin's managed config into the local `pnpm-workspace.yaml` — the catalogs and
pnpm settings the plugin would otherwise inject at install time, written
directly into the workspace file. The plugin is authoritative for the fields it
manages (config-only fields like `confirmModulesPurge` are skipped); unknown
keys and local-only catalogs are preserved; and a new export-only `local` key on
`PnpmConfigPlugin` overrides settings for the local export. Pass `--preview` to
print the result without writing. This lets a repo that develops the plugin (and
cannot consume it as a config dependency) test the exact catalogs and ranges
downstream consumers will receive.
```

- [ ] **Step 2: Validate the changeset**

Run: `pnpm exec savvy changeset validate-file .changeset/pnpm-workspace-export.md`
Expected: no errors.

- [ ] **Step 3: Add a short docs mention**

In `package/README.md`, under the "Keeping catalogs current" section (added for `upgrade`), add a brief paragraph: `rolldown-pnpm-config export` writes the config into `pnpm-workspace.yaml` for repos that develop the plugin rather than consume it; note the `local` key and `--preview`. Keep it to a few sentences; do not restate the spec.

- [ ] **Step 4: Commit**

```bash
git add .changeset/pnpm-workspace-export.md package/README.md
git commit -m "docs: changeset and README for the export command

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

## Self-Review

**Spec coverage:**

- Static evaluation of the config literal (no execution) → Task 1. ✓
- `workspaceYaml` descriptor flag + classification + completeness test → Task 2. ✓
- `local` export-only overlay → Task 3 (`applyLocal`), consumed in Task 5. ✓
- Plugin-overwrites merge, catalogs by-name, preserve unknown, never delete → Task 3 (`overlayWorkspace`). ✓
- Find/parse/render pnpm-workspace.yaml (walk-up, yaml, friendly sort) → Task 4. ✓
- Command surface (`[path]` optional source+target, create-if-absent, `--preview`) + config-module discovery + freeze reuse + workspaceYaml filter → Task 5. ✓
- No registry, no enforcement → by construction (Task 5 uses `freeze` only, no resolver). ✓
- Standalone (no `@savvy-web/silk-effects`) → Task 4 uses `yaml` directly with a local sort. ✓
- Changeset + docs → Task 6. ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code. The one judgement call — classifying 121 fields in Task 2 — is a defined research task with a concrete heuristic (anchor presence), the known seed (`confirmModulesPurge: false`), and a completeness + sanity test as the acceptance gate.

**Type consistency:** `evaluatePluginConfig` → `{ config, errors }` (Task 1) feeds `applyLocal` (Task 3) → `freeze` (Task 5). `overlayWorkspace(managed, parsed)` (Task 3) consumes the filtered `base` and `parseWorkspace` output (Task 4) in `runExport` (Task 5). `WORKSPACE_FIELDS` derives from `DESCRIPTORS[].workspaceYaml` (Task 2). `runExport` returns `{ path, rendered, written }`, asserted by the integration test.

**Open verification during execution:** (1) oxc node-type names in Task 1 (confirmed `Literal`/`ObjectExpression`/`ArrayExpression`/`Property` by the upgrade CLI's `discover.ts`); (2) `@effect/cli` `Args.optional`/`Options.boolean` shapes in Task 5 (confirmed available in the installed version); (3) `yaml` `parse`/`stringify` option names in Task 4 (mirror `savvy lint fmt`).
