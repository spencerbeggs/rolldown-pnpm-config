# export/preview split, local merge & override preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `export` from deleting local-protocol overrides, add `local.{preserve,value,strategy}` merge directives + automatic `excludeByRepo` at export, split `export`/`preview` into two commands, and make `preview` an `ink-tab` explorer with Changes/Full/Simulated views.

**Architecture:** `local` moves from a pre-freeze shallow replace to a post-freeze export-time merge: `freeze` yields shared `base`; export computes `effectiveManaged` = `base` filtered to workspace fields, then `excludeByRepo` (map read from the `freeze` manifest), then per-field `applyLocalDirective` (overwrite/union/difference/preserve, with `file:/link:/workspace:/portal:` preserved by default for `overrides`), then `overlayWorkspace` onto the parsed file. The three preview views are `buildDiff`/`renderExportDiff` over (parsed→merged) and (parsed→vanilla). All rendering reuses the shared `StyledLine`/`toAnsi` layer.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, Effect Schema, `@effect/cli`, Ink + React + `ink-tab`, Vitest (forks), Biome, `yaml`.

**Spec:** `.claude/design/rolldown-pnpm-config/specs/2026-06-29-export-local-merge-preview-design.md`
**Builds on:** the shared render layer from `2026-06-29-cli-diff-render-design.md` (`ui/styled.ts`, `ui/ansi.ts`, `ui/env.ts`, `diff/build.ts`, `diff/render.ts`, `workspace-file.ts#canonicalize`).

## Global Constraints

- Relative imports MUST use `.js` extensions; Node built-ins MUST use `node:`; type-only imports MUST use `import type`.
- No import cycles (Biome `noImportCycles` is an error).
- All tests live in `package/__test__/`, never `src/`. CLI tests in `package/__test__/cli/`; unit `*.test.ts`, integration `*.int.test.ts`, type tests `*.test-d.ts`.
- `exactOptionalPropertyTypes` ON: build optionals with conditional spreads; never assign `undefined`.
- `local` is EXPORT-TIME ONLY — never change `freeze`/`base` or the runtime pnpmfile to honor it.
- Default override preserve protocols (verbatim): `["file", "link", "workspace", "portal"]`. Match = override VALUE starts with `<proto>:`.
- `preserve` is overrides-only; arrays use `strategy`/`excludeByRepo`.
- Reuse `excludeByRepo`/`resolveRootName` from `package/src/runtime/ctx.js` verbatim — do not reimplement.
- Run a single test file: `pnpm vitest run <path>`. Use the shell, never an MCP test tool.
- Commits: Conventional Commits + `Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>`.

---

## File Structure

Created:

- `package/src/cli/local-merge.ts` — `isLocalDirective`, `applyLocalDirective`, `DEFAULT_PRESERVE`.
- `package/src/cli/effective.ts` — `effectiveManaged`, `vanillaManaged`.
- `package/src/cli/preview-views.ts` — `buildPreviewViews` → `{ changes, full, simulated }`.
- `package/src/cli/ui/Preview.ts` — Ink tabbed view (`ink-tab`).
- `package/src/cli/ui/run-preview.ts` — Effect bridge.
- `package/src/cli/commands/preview.ts` — the `preview` command.
- Tests: `local-merge.test.ts`, `effective.test.ts`, `preview-views.test.ts`, `preview.int.test.ts`, `preview-ui.test.ts`, and a `types/local-directive.test-d.ts`.

Modified:

- `package/src/define-plugin.ts` — `LocalDirective` type + widened `local`.
- `package/src/cli/commands/export.ts` — restructured pipeline; `--dry-run` replaces `--preview`; consumes `manifest`.
- `package/src/cli/bin.ts` — register `previewCommand`.
- `package/src/cli/local-overlay.ts` — removed (logic absorbed); update importers.
- `package/package.json` — add `ink-tab`.

---

## Phase 1 — Local merge engine + override preservation (data-loss fix)

### Task 1: `LocalDirective` type

**Files:**

- Modify: `package/src/define-plugin.ts:24` (the `local` field)
- Test: `package/__test__/types/local-directive.test-d.ts`

**Interfaces:**

- Produces: `interface LocalDirective<T> { readonly preserve?: readonly string[]; readonly value?: T; readonly strategy?: "union" | "difference" }`; `PluginConfig.local` widened so each field accepts its raw type OR `LocalDirective<that type>`.

- [ ] **Step 1: Write the type test**

```ts
import { expectTypeOf } from "vitest";
import type { LocalDirective, PluginConfig } from "../../src/define-plugin.js";

// LocalDirective is exported and all fields optional
expectTypeOf<LocalDirective<string[]>>().toMatchTypeOf<{ value?: string[] }>();

// local.overrides accepts BOTH a raw record and a directive
type Local = NonNullable<PluginConfig["local"]>;
expectTypeOf<{ overrides: Record<string, string> }>().toMatchTypeOf<Local>();
expectTypeOf<{ overrides: LocalDirective<Record<string, string>> }>().toMatchTypeOf<Local>();
expectTypeOf<{ publicHoistPattern: LocalDirective<string[]> }>().toMatchTypeOf<Local>();
```

- [ ] **Step 2: Run the typecheck to verify it fails**

Run: `pnpm run typecheck`
Expected: FAIL — `LocalDirective` is not exported / `local` too narrow.

- [ ] **Step 3: Edit `define-plugin.ts`**

Add the type above the `PluginConfig` interface (near the top exports):

```ts
/**
 * Per-field local merge directive applied only by `rolldown-pnpm-config export`.
 * All keys optional: `value` alone overwrites; `strategy` unions/differences
 * `value` with the managed value; `preserve` (overrides only) keeps existing
 * file entries whose value starts with a listed protocol.
 *
 * @public
 */
export interface LocalDirective<T> {
 readonly preserve?: readonly string[];
 readonly value?: T;
 readonly strategy?: "union" | "difference";
}
```

Replace the `local` field (currently `readonly local?: Partial<PluginConfig>;` at line 24, keep the surrounding JSDoc) with:

```ts
 readonly local?: {
  readonly [K in keyof PluginConfig]?: PluginConfig[K] | LocalDirective<PluginConfig[K]>;
 };
```

- [ ] **Step 4: Run the typecheck to verify it passes**

Run: `pnpm run typecheck`
Expected: PASS (4/4 tasks; ignore a pre-existing unrelated `@example/rolldown` symlink error if present).

- [ ] **Step 5: Commit**

```bash
git add package/src/define-plugin.ts package/__test__/types/local-directive.test-d.ts
git commit -m "feat(cli): add LocalDirective type and widen local for merge directives

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 2: `local-merge.ts` (pure directive engine)

**Files:**

- Create: `package/src/cli/local-merge.ts`
- Test: `package/__test__/cli/local-merge.test.ts`

**Interfaces:**

- Produces:
  - `const DEFAULT_PRESERVE: readonly string[]` = `["file", "link", "workspace", "portal"]`.
  - `function isLocalDirective(v: unknown): boolean` — true iff `v` is a non-array object whose keys are a non-empty subset of `{preserve, value, strategy}`.
  - `function applyLocalDirective(managed: unknown, raw: unknown, parsed: unknown, field: string): unknown` — computes the effective value for one field. `raw` is `config.local[field]` (or `undefined`). For `field === "overrides"` the default preserve always runs even when `raw` is `undefined`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { applyLocalDirective, isLocalDirective } from "../../src/cli/local-merge.js";

describe("isLocalDirective", () => {
 it("recognizes directive objects and rejects bare values", () => {
  expect(isLocalDirective({ strategy: "union", value: {} })).toBe(true);
  expect(isLocalDirective({ value: [] })).toBe(true);
  expect(isLocalDirective({ preserve: ["file"] })).toBe(true);
  expect(isLocalDirective(["@x/*"])).toBe(false); // bare array
  expect(isLocalDirective({ lodash: "^4" })).toBe(false); // bare record (foreign key)
  expect(isLocalDirective({ value: ">=1", lodash: "^4" })).toBe(false); // foreign key present
  expect(isLocalDirective(undefined)).toBe(false);
 });
});

describe("applyLocalDirective", () => {
 it("overwrites with a bare value", () => {
  expect(applyLocalDirective({ a: "1" }, { b: "2" }, undefined, "overrides")).toEqual({ b: "2" });
 });

 it("unions record values (value wins on clash)", () => {
  const out = applyLocalDirective(
   { a: "1", b: "1" },
   { strategy: "union", value: { b: "2", c: "3" } },
   undefined,
   "overrides",
  );
  expect(out).toEqual({ a: "1", b: "2", c: "3" });
 });

 it("differences record values (removes listed keys)", () => {
  const out = applyLocalDirective(
   { a: "1", b: "1", c: "1" },
   { strategy: "difference", value: { b: "x", c: "x" } },
   undefined,
   "overrides",
  );
  expect(out).toEqual({ a: "1" });
 });

 it("unions and differences array values", () => {
  expect(applyLocalDirective(["a", "b"], { strategy: "union", value: ["b", "c"] }, undefined, "publicHoistPattern")).toEqual([
   "a",
   "b",
   "c",
  ]);
  expect(
   applyLocalDirective(["@x/cli", "@x/mcp", "@y/z"], { strategy: "difference", value: ["@x/cli", "@x/mcp"] }, undefined, "publicHoistPattern"),
  ).toEqual(["@y/z"]);
 });

 it("preserves file:/link:/workspace:/portal: overrides from the parsed file by default", () => {
  const managed = { "@isaacs/brace-expansion": "^5.0.1" };
  const parsed = { "rolldown-pnpm-config": "file:/abs/pkg", lodash: "^4.0.0" };
  const out = applyLocalDirective(managed, undefined, parsed, "overrides") as Record<string, string>;
  expect(out["@isaacs/brace-expansion"]).toBe("^5.0.1"); // managed kept
  expect(out["rolldown-pnpm-config"]).toBe("file:/abs/pkg"); // file: preserved
  expect("lodash" in out).toBe(false); // non-protocol entry NOT preserved
 });

 it("an explicit preserve list replaces the default", () => {
  const parsed = { gitdep: "git+ssh://x", filedep: "file:/x" };
  const out = applyLocalDirective({}, { preserve: ["git+ssh"] }, parsed, "overrides") as Record<string, string>;
  expect(out.gitdep).toBe("git+ssh://x"); // explicitly preserved
  expect("filedep" in out).toBe(false); // file: no longer in the list
 });

 it("does not preserve for non-overrides fields", () => {
  const out = applyLocalDirective(["a"], undefined, ["file:x"], "publicHoistPattern");
  expect(out).toEqual(["a"]);
 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run package/__test__/cli/local-merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `local-merge.ts`**

```ts
/** Default protocols whose existing-file override entries are preserved. @internal */
export const DEFAULT_PRESERVE: readonly string[] = ["file", "link", "workspace", "portal"];

const DIRECTIVE_KEYS = new Set(["preserve", "value", "strategy"]);

/**
 * True when `v` is the `{ preserve?, value?, strategy? }` directive form: a
 * non-array object whose keys are a non-empty subset of the directive keys.
 * A record with any foreign key (e.g. a real override entry) is a bare value.
 *
 * @internal
 */
export function isLocalDirective(v: unknown): boolean {
 if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
 const keys = Object.keys(v);
 return keys.length > 0 && keys.every((k) => DIRECTIVE_KEYS.has(k));
}

function isRecord(v: unknown): v is Record<string, unknown> {
 return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Union/difference two records or two arrays; managed is the left operand. */
function combine(managed: unknown, value: unknown, strategy: "union" | "difference"): unknown {
 if (Array.isArray(managed) || Array.isArray(value)) {
  const m = Array.isArray(managed) ? managed : [];
  const v = Array.isArray(value) ? value : [];
  if (strategy === "union") return [...new Set([...m, ...v])];
  const drop = new Set(v.map((x) => JSON.stringify(x)));
  return m.filter((x) => !drop.has(JSON.stringify(x)));
 }
 const m = isRecord(managed) ? managed : {};
 const v = isRecord(value) ? value : {};
 if (strategy === "union") return { ...m, ...v };
 const out: Record<string, unknown> = { ...m };
 for (const k of Object.keys(v)) delete out[k];
 return out;
}

/**
 * Compute the effective value of one field from the managed value, the
 * `config.local[field]` directive (or bare value / undefined), and the parsed
 * existing-file value. For `overrides`, file-protocol entries are preserved
 * from `parsed` (default list unless the directive sets `preserve`).
 *
 * @internal
 */
export function applyLocalDirective(managed: unknown, raw: unknown, parsed: unknown, field: string): unknown {
 const directive = isLocalDirective(raw) ? (raw as { preserve?: readonly string[]; value?: unknown; strategy?: "union" | "difference" }) : { value: raw };

 // 1. base value: overwrite / union / difference / passthrough
 let result: unknown;
 if (directive.strategy && directive.value !== undefined) {
  result = combine(managed, directive.value, directive.strategy);
 } else if (directive.value !== undefined) {
  result = directive.value; // overwrite
 } else {
  result = managed; // passthrough (e.g. default preserve only)
 }

 // 2. preserve (overrides only)
 if (field === "overrides") {
  const protocols = directive.preserve ?? DEFAULT_PRESERVE;
  const base: Record<string, unknown> = isRecord(result) ? { ...result } : {};
  if (isRecord(parsed)) {
   for (const [k, val] of Object.entries(parsed)) {
    if (typeof val === "string" && protocols.some((p) => val.startsWith(`${p}:`))) base[k] = val;
   }
  }
  if (Object.keys(base).length === 0 && managed === undefined) return undefined;
  return base;
 }

 return result;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run package/__test__/cli/local-merge.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/local-merge.ts package/__test__/cli/local-merge.test.ts
git commit -m "feat(cli): add local merge directive engine with override preservation

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 3: `effective.ts` (excludeByRepo + local composition)

**Files:**

- Create: `package/src/cli/effective.ts`
- Test: `package/__test__/cli/effective.test.ts`

**Interfaces:**

- Consumes: `applyLocalDirective` (Task 2); `excludeByRepo`, `resolveRootName` from `../runtime/ctx.js`; `Manifest` from `../runtime/types.js`.
- Produces:
  - `function effectiveManaged(managed: Record<string, unknown>, local: Record<string, unknown> | undefined, parsed: Record<string, unknown>, manifest: Manifest, rootName: string | undefined): Record<string, unknown>` — applies excludeByRepo to `publicHoistPattern` then per-field local directives (always runs `overrides` for default preserve).
  - `function vanillaManaged(managed: Record<string, unknown>, manifest: Manifest, rootName: string | undefined): Record<string, unknown>` — excludeByRepo only, no local.

Note: callers resolve `rootName` via `resolveRootName({})` (falls back to `process.cwd()`); these pure functions take it as a parameter so they stay testable.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { effectiveManaged, vanillaManaged } from "../../src/cli/effective.js";
import type { Manifest } from "../../src/runtime/types.js";

const manifestWith = (byRepo?: Record<string, string[]>): Manifest => ({
 publicHoistPattern: {
  strategy: "arrayUnion",
  enforcement: "absent",
  ...(byRepo ? { options: { excludeByRepo: byRepo } } : {}),
 },
});

describe("effectiveManaged", () => {
 it("drops repo-assigned packages from publicHoistPattern", () => {
  const managed = { publicHoistPattern: ["@x/cli", "@x/keep"] };
  const out = effectiveManaged(managed, undefined, {}, manifestWith({ "my-repo": ["@x/cli"] }), "my-repo");
  expect(out.publicHoistPattern).toEqual(["@x/keep"]);
 });

 it("no-ops excludeByRepo when the repo is unresolved", () => {
  const managed = { publicHoistPattern: ["@x/cli"] };
  const out = effectiveManaged(managed, undefined, {}, manifestWith({ "my-repo": ["@x/cli"] }), undefined);
  expect(out.publicHoistPattern).toEqual(["@x/cli"]);
 });

 it("applies excludeByRepo BEFORE a local difference", () => {
  const managed = { publicHoistPattern: ["@x/cli", "@x/a", "@x/b"] };
  const local = { publicHoistPattern: { strategy: "difference", value: ["@x/a"] } };
  const out = effectiveManaged(managed, local, {}, manifestWith({ "my-repo": ["@x/cli"] }), "my-repo");
  expect(out.publicHoistPattern).toEqual(["@x/b"]); // @x/cli by repo, @x/a by local
 });

 it("preserves file: overrides by default with no local config", () => {
  const managed = { overrides: { "@isaacs/x": "^5" } };
  const parsed = { overrides: { link: "file:/abs" } };
  const out = effectiveManaged(managed, undefined, parsed, {}, "my-repo") as { overrides: Record<string, string> };
  expect(out.overrides).toEqual({ "@isaacs/x": "^5", link: "file:/abs" });
 });
});

describe("vanillaManaged", () => {
 it("applies excludeByRepo but no local/preserve", () => {
  const managed = { publicHoistPattern: ["@x/cli", "@x/keep"], overrides: { a: "^1" } };
  const parsed = { overrides: { link: "file:/abs" } };
  const out = vanillaManaged(managed, manifestWith({ "my-repo": ["@x/cli"] }), "my-repo") as Record<string, unknown>;
  expect(out.publicHoistPattern).toEqual(["@x/keep"]);
  expect(out.overrides).toEqual({ a: "^1" }); // NOT preserving parsed file: link
 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run package/__test__/cli/effective.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `effective.ts`**

```ts
import { excludeByRepo } from "../runtime/ctx.js";
import type { Manifest } from "../runtime/types.js";
import { applyLocalDirective } from "./local-merge.js";

/** Apply the manifest's excludeByRepo refine to publicHoistPattern, if present. */
function applyExcludeByRepo(
 out: Record<string, unknown>,
 manifest: Manifest,
 rootName: string | undefined,
): void {
 const byRepo = manifest.publicHoistPattern?.options?.excludeByRepo as Record<string, string[]> | undefined;
 const phl = out.publicHoistPattern;
 if (byRepo && typeof byRepo === "object" && Array.isArray(phl)) {
  out.publicHoistPattern = excludeByRepo(phl as string[], { rootName }, byRepo);
 }
}

/**
 * Compute the effective workspace fields for THIS repo: managed base, then
 * excludeByRepo on publicHoistPattern, then per-field local directives.
 * `overrides` always runs (default file-protocol preserve), even with no local.
 *
 * @internal
 */
export function effectiveManaged(
 managed: Record<string, unknown>,
 local: Record<string, unknown> | undefined,
 parsed: Record<string, unknown>,
 manifest: Manifest,
 rootName: string | undefined,
): Record<string, unknown> {
 const out: Record<string, unknown> = { ...managed };
 applyExcludeByRepo(out, manifest, rootName);

 const fields = new Set<string>(["overrides", ...Object.keys(local ?? {})]);
 for (const field of fields) {
  const next = applyLocalDirective(out[field], local?.[field], parsed[field], field);
  if (next === undefined) delete out[field];
  else out[field] = next;
 }
 return out;
}

/**
 * The fresh-consumer ("vanilla") workspace fields: managed base + excludeByRepo
 * only — no local overlay and no preserve.
 *
 * @internal
 */
export function vanillaManaged(
 managed: Record<string, unknown>,
 manifest: Manifest,
 rootName: string | undefined,
): Record<string, unknown> {
 const out: Record<string, unknown> = { ...managed };
 applyExcludeByRepo(out, manifest, rootName);
 return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run package/__test__/cli/effective.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/effective.ts package/__test__/cli/effective.test.ts
git commit -m "feat(cli): compose excludeByRepo and local directives into effective managed fields

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 4: Restructure `runExport` (write path uses the effective pipeline)

**Files:**

- Modify: `package/src/cli/commands/export.ts`
- Delete: `package/src/cli/local-overlay.ts`
- Test: `package/__test__/cli/export.int.test.ts`

**Interfaces:**

- Consumes: `effectiveManaged` (Task 3), `resolveRootName` (`../runtime/ctx.js`), `freeze` returning `{ base, manifest }`.
- Produces: `runExport` keeps its signature `{ configFile, workspacePath?, preview, full? } → { path, rendered, written, diff }` but now: takes `manifest` from `freeze`; builds `managed` from `base`; computes `effectiveManaged(managed, config.local, parsed, manifest, resolveRootName({}))`; overlays that. The pre-freeze `applyLocal` is removed.

- [ ] **Step 1: Add a failing integration test** (append to `export.int.test.ts`)

The existing CONFIG in that file already sets `local: { publicHoistPattern: ["@override/*"] }`. Add a new test that exercises override preservation:

```ts
it("preserves a file: override from the existing workspace on write", async () => {
 const { configFile, workspacePath } = setup(
  'overrides:\n  "rolldown-pnpm-config": "file:/abs/pkg"\n  lodash: "^4.0.0"\npackages:\n  - pkg/*\n',
 );
 const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: false }));
 expect(res.written).toBe(true);
 const out = parse(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
 const overrides = out.overrides as Record<string, string>;
 // the local file: link survives the managed-overrides overlay
 expect(overrides["rolldown-pnpm-config"]).toBe("file:/abs/pkg");
 // a managed override is still present
 expect(overrides["tar@<6.2.1"]).toBe(">=6.2.1");
 // a non-protocol pre-existing override is NOT preserved (managed overrides replace)
 expect("lodash" in overrides).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run package/__test__/cli/export.int.test.ts`
Expected: FAIL — current code drops the `file:` link (overrides replaced wholesale).

- [ ] **Step 3: Edit `export.ts`**

Replace the import of `applyLocal` and `overlayWorkspace`-related imports. Remove:

```ts
import { applyLocal } from "../local-overlay.js";
```

Add:

```ts
import { effectiveManaged } from "../effective.js";
import { resolveRootName } from "../../runtime/ctx.js";
```

In `runExport`, replace the block from `const effective = applyLocal(config);` through the `const managed` loop and the `const merged = overlayWorkspace(managed, parsed);` line with:

```ts
  const { base, manifest } = yield* freeze(config as unknown as Parameters<typeof freeze>[0]).pipe(
   Effect.mapError((e) => new ExportError({ message: e.message })),
  );
  const managed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
   if (WORKSPACE_FIELDS.has(k)) managed[k] = v;
  }

  const path = opts.workspacePath ?? findWorkspaceFile(process.cwd()) ?? join(process.cwd(), "pnpm-workspace.yaml");
  const parsed = existsSync(path)
   ? yield* Effect.try({
     try: () => parseWorkspace(readFileSync(path, "utf8")),
     catch: (e) => new ExportError({ message: `Cannot read or parse ${path}: ${String(e)}` }),
    })
   : {};

  const rootName = resolveRootName({});
  const localCfg = config.local && typeof config.local === "object" ? (config.local as Record<string, unknown>) : undefined;
  const effective = effectiveManaged(managed, localCfg, parsed, manifest, rootName);
  const merged = overlayWorkspace(effective, parsed);
  const rendered = renderWorkspace(merged);
```

(The diff-building block added in the prior plan stays; it already uses `canonicalize(parsed)` vs `canonicalize(merged)` and `localKeys = Object.keys(config.local ?? {})`. Leave it intact below this block.)

- [ ] **Step 4: Delete the dead module and fix importers**

```bash
git rm package/src/cli/local-overlay.ts
```

Then check for any other importer:

Run: `grep -rn "local-overlay" package/src package/__test__`
Expected: no matches (only `export.ts` used it; the existing `package/__test__/cli/local-overlay.test.ts` must be removed too):

```bash
git rm package/__test__/cli/local-overlay.test.ts
```

- [ ] **Step 5: Run the export integration + typecheck**

Run: `pnpm vitest run package/__test__/cli/export.int.test.ts`
Expected: PASS (existing tests + the new preserve test). The existing test asserting `out.publicHoistPattern` from `local` still passes: `local: { publicHoistPattern: ["@override/*"] }` is a bare array → overwrite, so the effective value is `["@override/*"]`.

Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/commands/export.ts package/__test__/cli/export.int.test.ts
git commit -m "feat(cli): export via effective pipeline; preserve local-protocol overrides

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Phase 2 — Command split

### Task 5: Split `export`/`--dry-run`; rename `--preview`

**Files:**

- Modify: `package/src/cli/commands/export.ts`
- Test: `package/__test__/cli/export.int.test.ts`

**Interfaces:**

- Consumes: `runExport` (Task 4) — unchanged signature.
- Produces: `exportCommand` now has `--dry-run` (boolean, default false) and `--full` (boolean, default false), no `--preview`. `--dry-run` prints the colored diff + legend and writes nothing; otherwise it writes.

- [ ] **Step 1: Edit the command options + handler in `export.ts`**

Replace the `previewFlag` constant with:

```ts
const dryRunFlag = Options.boolean("dry-run").pipe(Options.withDefault(false));
const fullFlag = Options.boolean("full").pipe(Options.withDefault(false));
```

Replace the `Command.make("export", ...)` block with:

```ts
export const exportCommand = Command.make(
 "export",
 { path: pathArg, dryRun: dryRunFlag, full: fullFlag },
 ({ path, dryRun, full }) =>
  Effect.gen(function* () {
   const matches = yield* findConfigFiles(process.cwd());
   const picked = pickConfigCandidate(matches);
   if (!picked.ok) return yield* Effect.fail(new ExportError({ message: picked.message }));
   const workspacePath = Option.getOrUndefined(path);
   const result = yield* runExport({
    configFile: picked.file,
    ...(workspacePath !== undefined ? { workspacePath } : {}),
    preview: dryRun,
    full,
   });
   yield* Effect.sync(() => {
    if (dryRun) {
     const caps = detectCapabilities();
     process.stdout.write(`${result.path} (dry run — not written)\n\n`);
     process.stdout.write(`${toAnsi(result.diff, { color: caps.color })}\n`);
     process.stdout.write("\n+ added  ~ changed  - removed   (local) local override  (unmanaged) not managed\n");
    } else process.stdout.write(`Exported to ${result.path}\n`);
   });
  }),
).pipe(Command.withDescription("Materialize the plugin config into pnpm-workspace.yaml (--dry-run to preview)"));
```

(`runExport`'s `preview` param means "don't write"; `--dry-run` maps to it. `detectCapabilities`/`toAnsi` are already imported from the prior plan.)

- [ ] **Step 2: Update the existing `--preview` test name in `export.int.test.ts`**

The integration tests call `runExport({ ..., preview: true })` directly, which is unchanged — no edits needed there. Verify there is no remaining reference to a `--preview` CLI flag in tests:

Run: `grep -rn "preview" package/__test__/cli/export.int.test.ts`
Expected: only `preview: true/false` option calls on `runExport` (the function param), which stay valid.

- [ ] **Step 3: Run export integration + typecheck**

Run: `pnpm vitest run package/__test__/cli/export.int.test.ts && pnpm run typecheck`
Expected: PASS / clean.

- [ ] **Step 4: Commit**

```bash
git add package/src/cli/commands/export.ts package/__test__/cli/export.int.test.ts
git commit -m "feat(cli): replace export --preview with export --dry-run

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Phase 3 — preview command + ink-tab

### Task 6: `preview-views.ts` (the three view builders)

**Files:**

- Create: `package/src/cli/preview-views.ts`
- Test: `package/__test__/cli/preview-views.test.ts`

**Interfaces:**

- Consumes: `buildDiff`/`DiffMeta` (`./diff/build.js`, `./diff/types.js`), `renderExportDiff` (`./diff/render.js`), `canonicalize` (`./workspace-file.js`), `StyledLine` (`./ui/styled.js`), `overlayWorkspace` (`./workspace-overlay.js`), `effectiveManaged`/`vanillaManaged` (`./effective.js`).
- Produces: `function buildPreviewViews(input: { managed: Record<string, unknown>; local?: Record<string, unknown>; parsed: Record<string, unknown>; manifest: Manifest; rootName: string | undefined }): { changes: StyledLine[]; full: StyledLine[]; simulated: StyledLine[] }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildPreviewViews } from "../../src/cli/preview-views.js";
import { toAnsi } from "../../src/cli/ui/ansi.js";
import type { Manifest } from "../../src/runtime/types.js";

// buildPreviewViews uses WORKSPACE_FIELDS internally for diff tagging.
const manifest: Manifest = { publicHoistPattern: { strategy: "arrayUnion", enforcement: "absent" } };

describe("buildPreviewViews", () => {
 it("changes view shows preserved file: override as unchanged-or-kept, not removed", () => {
  const managed = { overrides: { a: "^1" } };
  const parsed = { overrides: { link: "file:/abs", a: "^1" }, packages: ["p/*"] };
  const v = buildPreviewViews({ managed, parsed, manifest, rootName: "r" });
  const text = toAnsi(v.changes, { color: false });
  // file: link is preserved into merged, so it is NOT a removal line
  expect(text).not.toContain("- "); // no removed overrides line for the link
 });

 it("simulated view shows local-only + unmanaged keys as removed (unique to your repo)", () => {
  const managed = { overrides: { a: "^1" } };
  const parsed = { overrides: { link: "file:/abs", a: "^1" }, packages: ["p/*"] };
  const v = buildPreviewViews({ managed, parsed, manifest, rootName: "r" });
  const text = toAnsi(v.simulated, { color: false });
  // vanilla has no overlay: the link and packages are "removed" relative to your file
  expect(text).toContain("link");
  expect(text).toContain("packages");
 });

 it("full view emits more lines than changes for the same input", () => {
  const managed = { overrides: { a: "^1" }, publicHoistPattern: ["@x/keep"] };
  const parsed = { overrides: { a: "^2" }, b1: "x", b2: "x", b3: "x", b4: "x" } as Record<string, unknown>;
  const v = buildPreviewViews({ managed, parsed, manifest, rootName: "r" });
  expect(v.full.length).toBeGreaterThanOrEqual(v.changes.length);
 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run package/__test__/cli/preview-views.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `preview-views.ts`**

```ts
import { buildDiff } from "./diff/build.js";
import { renderExportDiff } from "./diff/render.js";
import type { DiffMeta } from "./diff/types.js";
import { WORKSPACE_FIELDS } from "./commands/export.js";
import { effectiveManaged, vanillaManaged } from "./effective.js";
import type { StyledLine } from "./ui/styled.js";
import { canonicalize } from "./workspace-file.js";
import { overlayWorkspace } from "./workspace-overlay.js";
import type { Manifest } from "../runtime/types.js";

/**
 * Build the three preview views as styled lines: Changes (parsed→merged, with
 * local + preserve + excludeByRepo), Full (same tree, full verbosity), and
 * Simulated (parsed→vanilla fresh-consumer output, no local/overlay).
 *
 * @internal
 */
export function buildPreviewViews(input: {
 managed: Record<string, unknown>;
 local?: Record<string, unknown>;
 parsed: Record<string, unknown>;
 manifest: Manifest;
 rootName: string | undefined;
}): { changes: StyledLine[]; full: StyledLine[]; simulated: StyledLine[] } {
 const meta: DiffMeta = {
  localKeys: new Set(input.local ? Object.keys(input.local) : []),
  managedKeys: WORKSPACE_FIELDS,
 };
 const effective = effectiveManaged(input.managed, input.local, input.parsed, input.manifest, input.rootName);
 const merged = overlayWorkspace(effective, input.parsed);
 const vanilla = vanillaManaged(input.managed, input.manifest, input.rootName);

 const before = canonicalize(input.parsed) as Record<string, unknown>;
 const changesTree = buildDiff(before, canonicalize(merged) as Record<string, unknown>, meta);
 const simulatedTree = buildDiff(before, canonicalize(vanilla) as Record<string, unknown>, meta);

 return {
  changes: renderExportDiff(changesTree, { full: false }),
  full: renderExportDiff(changesTree, { full: true }),
  simulated: renderExportDiff(simulatedTree, { full: false }),
 };
}
```

Note on imports: `WORKSPACE_FIELDS` is exported from `commands/export.ts`. If importing from a command into a sibling module risks a cycle (export.ts will import preview-views? it does not — only the `preview` command does), this is safe. Verify with `grep -n "preview-views" package/src/cli/commands/export.ts` → expected no matches.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run package/__test__/cli/preview-views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/preview-views.ts package/__test__/cli/preview-views.test.ts
git commit -m "feat(cli): build changes/full/simulated preview views from the diff layer

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 7: `ink-tab` Preview component + run bridge

**Files:**

- Modify: `package/package.json` (add `ink-tab`)
- Create: `package/src/cli/ui/Preview.ts`
- Create: `package/src/cli/ui/run-preview.ts`
- Test: `package/__test__/cli/preview-ui.test.ts`

**Interfaces:**

- Consumes: `StyledLine` (`../styled? ../ui/styled.js`), `toAnsi`? No — Preview maps `StyledLine`→Ink `Text` directly. `ink-tab` `Tabs`/`Tab`.
- Produces: `Preview(props: { views: { changes: StyledLine[]; full: StyledLine[]; simulated: StyledLine[] }; onExit: () => void }): ReactElement`; `runPreview(views): Effect.Effect<void>`.

- [ ] **Step 1: Add the dependency**

Run: `cd package && pnpm add ink-tab && cd ..`
Expected: `package/package.json` dependencies include `ink-tab`. (Offline fallback: add `"ink-tab": "^5.0.0"` and `pnpm install`.)

- [ ] **Step 2: Write the failing UI test**

```ts
import { render } from "ink-testing-library";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { Preview } from "../../src/cli/ui/Preview.js";
import type { StyledLine } from "../../src/cli/ui/styled.js";

const line = (text: string): StyledLine => ({ indent: 0, gutter: " ", segments: [{ text, style: "plain" }] });

describe("Preview", () => {
 it("renders the tab labels and the active (Changes) view first", () => {
  const views = {
   changes: [line("CHANGES_VIEW")],
   full: [line("FULL_VIEW")],
   simulated: [line("SIMULATED_VIEW")],
  };
  const { lastFrame } = render(createElement(Preview, { views, onExit: () => {} }));
  const frame = lastFrame() ?? "";
  expect(frame).toContain("Changes");
  expect(frame).toContain("Full");
  expect(frame).toContain("Simulated");
  expect(frame).toContain("CHANGES_VIEW");
 });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run package/__test__/cli/preview-ui.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `Preview.ts`**

```ts
import { Box, Text, useApp, useInput } from "ink";
import { Tab, Tabs } from "ink-tab";
import type { ReactElement } from "react";
import { createElement, useState } from "react";
import type { StyledLine } from "./styled.js";

interface PreviewViews {
 readonly changes: readonly StyledLine[];
 readonly full: readonly StyledLine[];
 readonly simulated: readonly StyledLine[];
}

const INK_COLOR: Record<string, string | undefined> = {
 added: "green",
 removed: "red",
 changed: "yellow",
 warn: "red",
 local: "magenta",
 unmanaged: "gray",
 unchanged: "gray",
 plain: undefined,
};

function renderLines(lines: readonly StyledLine[]): ReactElement {
 return createElement(
  Box,
  { flexDirection: "column" },
  ...lines.map((l, i) => {
   const indent = "  ".repeat(l.indent);
   const tag = l.tag ? `  (${l.tag})` : "";
   const body = l.segments.map((s, j) => {
    const color = INK_COLOR[s.style];
    return createElement(Text, { key: j, ...(color ? { color } : {}) }, s.text);
   });
   return createElement(Text, { key: i }, `${l.gutter} ${indent}`, ...body, tag);
  }),
 );
}

/**
 * Interactive export preview: an ink-tab bar over the Changes / Full /
 * Simulated views. `q`/Esc exits. Written with React.createElement (no JSX).
 *
 * @internal
 */
export function Preview({ views, onExit }: { views: PreviewViews; onExit: () => void }): ReactElement {
 const app = useApp();
 const [active, setActive] = useState<keyof PreviewViews>("changes");

 useInput((input, key) => {
  if (input === "q" || key.escape) {
   onExit();
   app.exit();
  }
 });

 const tabs = createElement(
  Tabs,
  { onChange: (name: string) => setActive(name as keyof PreviewViews) },
  createElement(Tab, { name: "changes" }, "Changes"),
  createElement(Tab, { name: "full" }, "Full"),
  createElement(Tab, { name: "simulated" }, "Simulated"),
 );

 return createElement(Box, { flexDirection: "column" }, tabs, renderLines(views[active]));
}
```

- [ ] **Step 5: Write `run-preview.ts`**

```ts
import { Effect } from "effect";
import { render } from "ink";
import { createElement } from "react";
import { Preview } from "./Preview.js";
import type { StyledLine } from "./styled.js";

/**
 * Render the interactive Preview inside an Effect, resolving once the user
 * exits and Ink has fully torn down.
 *
 * @internal
 */
export function runPreview(views: {
 changes: StyledLine[];
 full: StyledLine[];
 simulated: StyledLine[];
}): Effect.Effect<void> {
 return Effect.async<void>((resume) => {
  const instance = render(createElement(Preview, { views, onExit: () => {} }));
  void instance.waitUntilExit().then(() => resume(Effect.void));
 });
}
```

- [ ] **Step 6: Run the UI test + typecheck**

Run: `pnpm vitest run package/__test__/cli/preview-ui.test.ts && pnpm run typecheck`
Expected: PASS / clean. If `ink-tab`'s `onChange` prop name or `Tab` API differs in the installed version, adjust to the installed types (check `node_modules/ink-tab`), keeping the same labels and the `name` keys `changes`/`full`/`simulated`.

- [ ] **Step 7: Commit**

```bash
git add package/package.json package/src/cli/ui/Preview.ts package/src/cli/ui/run-preview.ts package/__test__/cli/preview-ui.test.ts pnpm-lock.yaml
git commit -m "feat(cli): add ink-tab Preview component and run-preview bridge

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 8: `preview` command + non-TTY fallback + bin registration

**Files:**

- Create: `package/src/cli/commands/preview.ts`
- Modify: `package/src/cli/bin.ts`
- Test: `package/__test__/cli/preview.int.test.ts`

**Interfaces:**

- Consumes: `buildPreviewViews` (Task 6), `runPreview` (Task 7), `detectCapabilities`/`toAnsi`/`StyledLine` (shared), `freeze`, `effectiveManaged`/`resolveRootName`, `evaluatePluginConfig`, `findConfigFiles`/`pickConfigCandidate`, `findWorkspaceFile`/`parseWorkspace`, `WORKSPACE_FIELDS`.
- Produces: `previewCommand` (a `@effect/cli` Command). An exported testable core `runPreviewViews(opts: { configFile: string; workspacePath?: string }): Effect.Effect<{ changes: StyledLine[]; full: StyledLine[]; simulated: StyledLine[] }, PreviewError>`.

- [ ] **Step 1: Write the failing integration test**

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runPreviewViews } from "../../src/cli/commands/preview.js";
import { toAnsi } from "../../src/cli/ui/ansi.js";

const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
 overrides: { "tar@<6.2.1": ">=6.2.1" },
});
`;

function setup(workspaceContent: string): { configFile: string; workspacePath: string } {
 const dir = mkdtempSync(join(tmpdir(), "rpc-preview-"));
 const configFile = join(dir, "savvy.build.ts");
 writeFileSync(configFile, CONFIG, "utf8");
 const workspacePath = join(dir, "pnpm-workspace.yaml");
 writeFileSync(workspacePath, workspaceContent, "utf8");
 return { configFile, workspacePath };
}

describe("runPreviewViews", () => {
 it("returns three views; simulated shows the local file: override as removed", async () => {
  const { configFile, workspacePath } = setup(
   'overrides:\n  "rolldown-pnpm-config": "file:/abs/pkg"\npackages:\n  - pkg/*\n',
  );
  const views = await Effect.runPromise(runPreviewViews({ configFile, workspacePath }));
  expect(views.changes.length).toBeGreaterThan(0);
  expect(views.full.length).toBeGreaterThanOrEqual(views.changes.length);
  // changes view preserves the file: link (no removal); simulated shows it as unique-to-repo
  expect(toAnsi(views.changes, { color: false })).not.toContain("- ");
  expect(toAnsi(views.simulated, { color: false })).toContain("rolldown-pnpm-config");
 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run package/__test__/cli/preview.int.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `preview.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Args, Command } from "@effect/cli";
import { Data, Effect, Option } from "effect";
import { freeze } from "../../plugin/freeze.js";
import { resolveRootName } from "../../runtime/ctx.js";
import { WORKSPACE_FIELDS } from "./export.js";
import { evaluatePluginConfig } from "../evaluate.js";
import { buildPreviewViews } from "../preview-views.js";
import { findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { detectCapabilities } from "../ui/env.js";
import { toAnsi } from "../ui/ansi.js";
import { runPreview } from "../ui/run-preview.js";
import { findWorkspaceFile, parseWorkspace } from "../workspace-file.js";

/** Typed failure for the preview run. @internal */
export class PreviewError extends Data.TaggedError("PreviewError")<{ readonly message: string }> {}

/**
 * Build the three preview views from a config + workspace file. Pure of any
 * terminal interaction; the command wraps this with interactive/non-TTY output.
 *
 * @internal
 */
export function runPreviewViews(opts: { configFile: string; workspacePath?: string }) {
 return Effect.gen(function* () {
  const configSource = yield* Effect.try({
   try: () => readFileSync(opts.configFile, "utf8"),
   catch: () => new PreviewError({ message: `Cannot read ${opts.configFile}` }),
  });
  const { config, errors } = evaluatePluginConfig(configSource, opts.configFile);
  if (config === null) return yield* Effect.fail(new PreviewError({ message: `No PnpmConfigPlugin call found in ${opts.configFile}` }));
  if (errors.length > 0) return yield* Effect.fail(new PreviewError({ message: `Non-literal config values: ${errors.join("; ")}` }));

  const { base, manifest } = yield* freeze(config as unknown as Parameters<typeof freeze>[0]).pipe(
   Effect.mapError((e) => new PreviewError({ message: e.message })),
  );
  const managed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) if (WORKSPACE_FIELDS.has(k)) managed[k] = v;

  const path = opts.workspacePath ?? findWorkspaceFile(process.cwd()) ?? join(process.cwd(), "pnpm-workspace.yaml");
  const parsed = existsSync(path)
   ? yield* Effect.try({
     try: () => parseWorkspace(readFileSync(path, "utf8")),
     catch: (e) => new PreviewError({ message: `Cannot read or parse ${path}: ${String(e)}` }),
    })
   : {};
  const localCfg = config.local && typeof config.local === "object" ? (config.local as Record<string, unknown>) : undefined;
  return buildPreviewViews({ managed, ...(localCfg ? { local: localCfg } : {}), parsed, manifest, rootName: resolveRootName({}) });
 });
}

const pathArg = Args.file({ name: "path" }).pipe(Args.optional);

/**
 * The "preview" command: interactive ink-tab explorer of the export diff
 * (Changes / Full / Simulated). Falls back to printing the Changes view when
 * the terminal is non-interactive.
 *
 * @internal
 */
export const previewCommand = Command.make("preview", { path: pathArg }, ({ path }) =>
 Effect.gen(function* () {
  const matches = yield* findConfigFiles(process.cwd());
  const picked = pickConfigCandidate(matches);
  if (!picked.ok) return yield* Effect.fail(new PreviewError({ message: picked.message }));
  const workspacePath = Option.getOrUndefined(path);
  const views = yield* runPreviewViews({ configFile: picked.file, ...(workspacePath !== undefined ? { workspacePath } : {}) });
  const caps = detectCapabilities();
  if (caps.interactive) {
   yield* runPreview(views);
  } else {
   yield* Effect.sync(() => process.stdout.write(`${toAnsi(views.changes, { color: caps.color })}\n`));
  }
 }),
).pipe(Command.withDescription("Interactively preview how pnpm-workspace.yaml would change"));
```

- [ ] **Step 4: Register the command in `bin.ts`**

Edit `package/src/cli/bin.ts`: add the import and include in subcommands:

```ts
import { previewCommand } from "./commands/preview.js";
```

```ts
const root = Command.make("rolldown-pnpm-config").pipe(
 Command.withSubcommands([upgradeCommand, exportCommand, previewCommand]),
);
```

- [ ] **Step 5: Run the preview integration + full CLI suite + typecheck**

Run: `pnpm vitest run package/__test__/cli/preview.int.test.ts`
Expected: PASS.

Run: `pnpm vitest run package/__test__/cli && pnpm run typecheck`
Expected: all PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/commands/preview.ts package/src/cli/bin.ts package/__test__/cli/preview.int.test.ts
git commit -m "feat(cli): add preview command with ink-tab views and non-TTY fallback

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Final verification

- [ ] **Full suite + typecheck + lint**

Run: `pnpm run typecheck && pnpm run test && pnpm run lint`
Expected: `rolldown-pnpm-config` green with coverage thresholds met; lint exit 0. (If `@example/rolldown` e2e fails with ENOENT on `pnpmfile.mjs`, that is an unbuilt gitignored artifact — `cd examples/rolldown && pnpm exec rolldown -c` then re-run; unrelated to this work.)

- [ ] **Manual smoke (real TTY) from the dogfood consumer** (`../../savvy-web/systems`)

```bash
rolldown-pnpm-config export --dry-run        # colored diff, file: link NOT shown as removed
rolldown-pnpm-config export --dry-run --full # whole tree
rolldown-pnpm-config preview                 # ink-tab: Changes / Full / Simulated
rolldown-pnpm-config export                  # writes; file: link preserved in overrides
```

Expected: the `rolldown-pnpm-config: file:…` override survives `export`; `excludeByRepo`-assigned hoist packages are absent when the author config supplies the map.

---

## Notes / out of scope

- Runtime pnpmfile honoring `local` (stays shared-config).
- `preserve` for non-record fields.
- Interactive write-from-preview (preview is read-only; use `export`).
- Root-cause `upgrade` TTY hang (separate debugging task).
- `excludeByRepo` only drops packages when the author config supplies the `publicHoistPattern.excludeByRepo` map (threaded by `freeze` into the manifest); otherwise it is a no-op and `local.publicHoistPattern` `difference` is the manual fallback.
