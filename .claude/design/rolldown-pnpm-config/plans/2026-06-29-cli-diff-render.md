# Shared CLI diff/render system Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `export --preview` a colored, canonical diff of how `pnpm-workspace.yaml` will change, and share that render system with `upgrade` (colorized summary + new `upgrade --preview`), with capability detection via `std-env`/`std-osc8` and a non-TTY fallback so `upgrade` never hangs in non-interactive contexts.

**Architecture:** A shared render layer under `package/src/cli/ui/` defines a `StyledLine` contract, a pure `toAnsi` renderer, and a single `env.ts` capability wrapper over `std-env`/`std-osc8`. `export` gets a structured diff (`diff/build.ts` + `diff/render.ts`) over canonicalized before/after data; array sorting becomes part of canonical format. `upgrade`'s existing `renderSummary` is refactored to build `StyledLine[]` and render through the same path. All render functions are pure and receive capability flags as parameters; only `env.ts` reads the environment.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, `@effect/cli`, Ink + React, Vitest (forks pool), Biome, `std-env`, `std-osc8`, `yaml`.

**Spec:** `.claude/design/rolldown-pnpm-config/specs/2026-06-29-cli-diff-render-design.md`

## Global Constraints

- Relative imports MUST use `.js` extensions; Node built-ins MUST use `node:` protocol; type-only imports MUST use `import type`.
- No import cycles (Biome `noImportCycles` is an error).
- All tests live in `package/__test__/`, never in `src/`. CLI tests live in `package/__test__/cli/`; unit tests are `*.test.ts`, integration tests `*.int.test.ts`.
- `exactOptionalPropertyTypes` is on: never pass `undefined` to an optional prop; omit it instead.
- Render functions (`toAnsi`, `renderExportDiff`, `summaryLines`, `renderSummary`) MUST NOT read `process.env`, `process.stdout`, or call `std-env`/`std-osc8`. Capability flags are passed in. Only `ui/env.ts` touches those.
- Commit messages: Conventional Commits + DCO footer `Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>`.
- Run a single test file with: `pnpm vitest run <path>`.

---

## File Structure

Created:

- `package/src/cli/ui/styled.ts` — `StyledLine`, `Segment`, `ChangeStyle`, `DiffTag`, gutter + ANSI code tables.
- `package/src/cli/ui/ansi.ts` — `toAnsi(lines, { color })` pure renderer.
- `package/src/cli/ui/env.ts` — `detectCapabilities()`, re-export `link`; sole importer of `std-env`/`std-osc8`.
- `package/src/cli/diff/types.ts` — `DiffNode`, `ChangeKind`, `DiffMeta`.
- `package/src/cli/diff/build.ts` — `buildDiff(before, after, meta)`.
- `package/src/cli/diff/render.ts` — `renderExportDiff(node, { full })`.
- Tests: `package/__test__/cli/ui-ansi.test.ts`, `ui-env.test.ts`, `diff-build.test.ts`, `diff-render.test.ts`.

Modified:

- `package/package.json` — add `std-env`, `std-osc8` deps.
- `package/src/cli/workspace-file.ts` — export `canonicalize`; sort primitive arrays.
- `package/src/cli/summary.ts` — add `summaryLines`; `renderSummary` delegates with color.
- `package/src/cli/ui/Walk.ts` — adopt shared palette tokens.
- `package/src/cli/commands/export.ts` — `--full`, return diff, render colored.
- `package/src/cli/commands/upgrade.ts` — `--preview`, `--full`, color, non-TTY fallback.
- Tests: `summary.test.ts`, `workspace-file.test.ts`, `export.int.test.ts`, `upgrade.int.test.ts`.

---

## Phase 1 — Shared render + env detection

### Task 1: Styled line contract + `toAnsi`

**Files:**

- Create: `package/src/cli/ui/styled.ts`
- Create: `package/src/cli/ui/ansi.ts`
- Test: `package/__test__/cli/ui-ansi.test.ts`

**Interfaces:**

- Produces: `ChangeStyle`, `DiffTag`, `Segment`, `StyledLine` (from `styled.ts`); `toAnsi(lines: readonly StyledLine[], opts: { color: boolean }): string` (from `ansi.ts`); `GUTTER` map and `tagSuffix(tag)` helper (from `styled.ts`).

- [ ] **Step 1: Write `styled.ts`** (types + tables; no env reads)

```ts
/** Visual category for a segment or whole line. @internal */
export type ChangeStyle =
 | "added"
 | "removed"
 | "changed"
 | "unchanged"
 | "warn"
 | "local"
 | "unmanaged"
 | "plain";

/** Orthogonal annotation attached to a line. @internal */
export type DiffTag = "local" | "unmanaged";

/** A run of text with one style. @internal */
export interface Segment {
 readonly text: string;
 readonly style: ChangeStyle;
}

/** One rendered line: a gutter char, an indent depth, styled text, optional tag. @internal */
export interface StyledLine {
 readonly indent: number;
 readonly gutter: "+" | "~" | "-" | " " | "·" | "░" | "⚠";
 readonly segments: readonly Segment[];
 readonly tag?: DiffTag;
}

/** SGR open/close codes per style (close is always 0=reset for simplicity). @internal */
export const ANSI_OPEN: Record<ChangeStyle, string> = {
 added: "\x1b[32m", // green
 removed: "\x1b[31m", // red
 changed: "\x1b[33m", // yellow
 warn: "\x1b[31m", // red
 local: "\x1b[35m", // magenta
 unmanaged: "\x1b[2m", // dim
 unchanged: "\x1b[2m", // dim
 plain: "",
};
const ANSI_RESET = "\x1b[0m";

/** Apply (or omit) the SGR code for a style. @internal */
export function paint(text: string, style: ChangeStyle, color: boolean): string {
 if (!color || style === "plain" || ANSI_OPEN[style] === "") return text;
 return `${ANSI_OPEN[style]}${text}${ANSI_RESET}`;
}

/** The trailing annotation for a tag, e.g. "  (local)". @internal */
export function tagSuffix(tag: DiffTag | undefined): string {
 if (tag === "local") return "  (local)";
 if (tag === "unmanaged") return "  (unmanaged)";
 return "";
}
```

- [ ] **Step 2: Write the failing test for `toAnsi`**

```ts
import { describe, expect, it } from "vitest";
import { toAnsi } from "../../src/cli/ui/ansi.js";
import type { StyledLine } from "../../src/cli/ui/styled.js";

const line = (o: Partial<StyledLine>): StyledLine => ({
 indent: 0,
 gutter: " ",
 segments: [{ text: "x", style: "plain" }],
 ...o,
});

describe("toAnsi", () => {
 it("renders gutter, indent, and text with no color", () => {
  const out = toAnsi([line({ gutter: "+", indent: 1, segments: [{ text: "react: ^19", style: "added" }] })], {
   color: false,
  });
  expect(out).toBe("+   react: ^19");
 });

 it("appends the tag annotation", () => {
  const out = toAnsi([line({ gutter: "░", segments: [{ text: "packages:", style: "unmanaged" }], tag: "unmanaged" })], {
   color: false,
  });
  expect(out).toBe("░ packages:  (unmanaged)");
 });

 it("wraps segments in SGR codes when color is on, same text otherwise", () => {
  const l = line({ gutter: "+", segments: [{ text: "a", style: "added" }] });
  const plain = toAnsi([l], { color: false });
  const colored = toAnsi([l], { color: true });
  expect(colored).toContain("\x1b[32m");
  expect(colored.replace(/\x1b\[[0-9]*m/g, "")).toBe(plain);
 });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm vitest run package/__test__/cli/ui-ansi.test.ts`
Expected: FAIL — cannot find module `ansi.js`.

- [ ] **Step 4: Write `ansi.ts`**

```ts
import { type StyledLine, paint, tagSuffix } from "./styled.js";

/**
 * Render styled lines to a string. Each line is
 * `<gutter><space><2-space-indent><painted segments><tag>`.
 * Pure: color is decided by the caller, never read from the environment.
 *
 * @internal
 */
export function toAnsi(lines: readonly StyledLine[], opts: { color: boolean }): string {
 return lines
  .map((l) => {
   const indent = "  ".repeat(l.indent);
   const body = l.segments.map((s) => paint(s.text, s.style, opts.color)).join("");
   return `${l.gutter} ${indent}${body}${tagSuffix(l.tag)}`;
  })
  .join("\n");
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `pnpm vitest run package/__test__/cli/ui-ansi.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/ui/styled.ts package/src/cli/ui/ansi.ts package/__test__/cli/ui-ansi.test.ts
git commit -m "feat(cli): add shared StyledLine contract and toAnsi renderer

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 2: Capability detection (`env.ts`) + dependencies

**Files:**

- Modify: `package/package.json` (add deps)
- Create: `package/src/cli/ui/env.ts`
- Test: `package/__test__/cli/ui-env.test.ts`

**Interfaces:**

- Consumes: `std-env`, `std-osc8`.
- Produces: `interface Capabilities { color: boolean; interactive: boolean; hyperlinks: boolean }`; `detectCapabilities(): Capabilities`; re-exports `link` and `supportsHyperlinks` from `std-osc8`.

- [ ] **Step 1: Add dependencies**

Run:

```bash
cd package && pnpm add std-env std-osc8 && cd ..
```

Expected: `package/package.json` `dependencies` now include `std-env` and `std-osc8`. (If offline, manually add `"std-env": "^4.1.0"` and `"std-osc8": "^0.1.0"` to `package/package.json` dependencies and run `pnpm install`.)

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { detectCapabilities } from "../../src/cli/ui/env.js";

describe("detectCapabilities", () => {
 it("returns a capability record of booleans", () => {
  const caps = detectCapabilities();
  expect(typeof caps.color).toBe("boolean");
  expect(typeof caps.interactive).toBe("boolean");
  expect(typeof caps.hyperlinks).toBe("boolean");
 });

 it("is never interactive under CI", () => {
  const prev = process.env.CI;
  process.env.CI = "true";
  try {
   // std-env reads CI lazily per call site; interactive must be false in CI.
   expect(detectCapabilities().interactive).toBe(false);
  } finally {
   if (prev === undefined) delete process.env.CI;
   else process.env.CI = prev;
  }
 });
});
```

Note: `std-env` computes `isCI`/`hasTTY` at import time, so the second assertion is environment-dependent. If `std-env` caches `isCI` at import, keep the test but read `isCI` through a function form. Implement `interactive` so that under a CI env var it is false (see Step 4); if the cached-import behavior makes this flaky, drop the second `it` and keep only the shape test.

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm vitest run package/__test__/cli/ui-env.test.ts`
Expected: FAIL — cannot find module `env.js`.

- [ ] **Step 4: Write `env.ts`**

```ts
import { hasTTY, isAgent, isCI, isColorSupported } from "std-env";
import { link, supportsHyperlinks } from "std-osc8";

/** Detected terminal capabilities for the current process. @internal */
export interface Capabilities {
 /** ANSI color is supported and not disabled via NO_COLOR. */
 readonly color: boolean;
 /** Safe to enter a raw-mode interactive UI (real TTY, not CI/agent). */
 readonly interactive: boolean;
 /** OSC-8 hyperlinks render in this terminal. */
 readonly hyperlinks: boolean;
}

/**
 * Detect color / interactivity / hyperlink support once, at the command edge.
 * The render layer consumes the returned flags and never reads the environment.
 *
 * @internal
 */
export function detectCapabilities(): Capabilities {
 return {
  color: isColorSupported,
  interactive: hasTTY && !isCI && !isAgent,
  hyperlinks: supportsHyperlinks,
 };
}

export { link, supportsHyperlinks };
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `pnpm vitest run package/__test__/cli/ui-env.test.ts`
Expected: PASS (shape test always; CI test if env allows — otherwise remove it per Step 2 note).

- [ ] **Step 6: Commit**

```bash
git add package/package.json package/src/cli/ui/env.ts package/__test__/cli/ui-env.test.ts pnpm-lock.yaml
git commit -m "feat(cli): add std-env/std-osc8 capability detection wrapper

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Phase 2 — export diff

### Task 3: Canonical array sorting + exported `canonicalize`

**Files:**

- Modify: `package/src/cli/workspace-file.ts`
- Test: `package/__test__/cli/workspace-file.test.ts`

**Interfaces:**

- Produces: `canonicalize(value: unknown): unknown` (recursive: alpha-sort object keys; lexicographically sort arrays whose elements are ALL primitives; leave object-containing arrays in order). `renderWorkspace` uses it internally.

- [ ] **Step 1: Add failing tests** (append to `workspace-file.test.ts`)

```ts
import { canonicalize } from "../../src/cli/workspace-file.js";

describe("canonicalize", () => {
 it("sorts primitive arrays lexicographically", () => {
  expect(canonicalize({ a: ["swc", "esbuild", "sharp"] })).toEqual({ a: ["esbuild", "sharp", "swc"] });
 });

 it("preserves arrays that contain objects", () => {
  const v = { a: [{ x: 2 }, { x: 1 }] };
  expect(canonicalize(v)).toEqual({ a: [{ x: 2 }, { x: 1 }] });
 });

 it("alpha-sorts object keys recursively", () => {
  expect(Object.keys(canonicalize({ b: 1, a: { d: 1, c: 2 } }) as Record<string, unknown>)).toEqual(["a", "b"]);
 });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm vitest run package/__test__/cli/workspace-file.test.ts`
Expected: FAIL — `canonicalize` is not exported.

- [ ] **Step 3: Edit `workspace-file.ts`**

Replace the private `sortKeys` (lines 8-19) with an exported `canonicalize` that also sorts primitive arrays, and point `renderWorkspace` at it:

```ts
/** True when every element is a string/number/boolean (safe to sort). */
function allPrimitive(arr: readonly unknown[]): boolean {
 return arr.every((v) => v === null || (typeof v !== "object" && typeof v !== "function"));
}

/**
 * Canonical form for deterministic output and diffing: object keys alpha-sorted
 * recursively; arrays of all-primitive elements sorted lexicographically;
 * arrays containing objects keep their order.
 *
 * @internal
 */
export function canonicalize(value: unknown): unknown {
 if (Array.isArray(value)) {
  const mapped = value.map(canonicalize);
  return allPrimitive(mapped) ? [...mapped].sort((a, b) => String(a).localeCompare(String(b))) : mapped;
 }
 if (value !== null && typeof value === "object") {
  return Object.fromEntries(
   Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, canonicalize(v)]),
  );
 }
 return value;
}
```

Then change `renderWorkspace` (line 45-47) to use it:

```ts
export function renderWorkspace(obj: Record<string, unknown>): string {
 return stringify(canonicalize(obj), STRINGIFY_OPTIONS);
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run package/__test__/cli/workspace-file.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the export integration to confirm no regression**

Run: `pnpm vitest run package/__test__/cli/export.int.test.ts`
Expected: PASS (array order is the only output change; existing assertions use `toEqual` on single-element arrays, unaffected).

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/workspace-file.ts package/__test__/cli/workspace-file.test.ts
git commit -m "feat(cli): export canonicalize and sort primitive arrays in canonical form

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 4: `buildDiff` diff model

**Files:**

- Create: `package/src/cli/diff/types.ts`
- Create: `package/src/cli/diff/build.ts`
- Test: `package/__test__/cli/diff-build.test.ts`

**Interfaces:**

- Consumes: nothing (operates on canonicalized plain data).
- Produces:

```ts
export type ChangeKind = "added" | "removed" | "changed" | "unchanged";
export interface DiffNode {
 readonly key: string;
 readonly path: readonly string[];
 readonly kind: ChangeKind;
 readonly tag?: "local" | "unmanaged";
 readonly before?: unknown;
 readonly after?: unknown;
 readonly children?: readonly DiffNode[];
}
export interface DiffMeta {
 readonly localKeys: ReadonlySet<string>;
 readonly managedKeys: ReadonlySet<string>;
}
export function buildDiff(before: Record<string, unknown>, after: Record<string, unknown>, meta: DiffMeta): DiffNode;
```

The returned root has `key: ""`, `path: []`, `kind` = worst child kind (`changed` if any child differs, else `unchanged`), and `children` for the top-level keys.

- [ ] **Step 1: Write `types.ts`**

```ts
/** Kind of change at a node. @internal */
export type ChangeKind = "added" | "removed" | "changed" | "unchanged";

/** A node in the structured diff tree. @internal */
export interface DiffNode {
 readonly key: string;
 readonly path: readonly string[];
 readonly kind: ChangeKind;
 readonly tag?: "local" | "unmanaged";
 readonly before?: unknown;
 readonly after?: unknown;
 readonly children?: readonly DiffNode[];
}

/** Classification metadata for the top-level keys. @internal */
export interface DiffMeta {
 readonly localKeys: ReadonlySet<string>;
 readonly managedKeys: ReadonlySet<string>;
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildDiff } from "../../src/cli/diff/build.js";
import type { DiffMeta } from "../../src/cli/diff/types.js";

const meta = (o: Partial<DiffMeta> = {}): DiffMeta => ({
 localKeys: new Set(),
 managedKeys: new Set(["catalogMode", "dedupeDirectDeps", "catalogs", "onlyBuiltDependencies"]),
 ...o,
});

const child = (root: ReturnType<typeof buildDiff>, key: string) =>
 (root.children ?? []).find((c) => c.key === key);

describe("buildDiff", () => {
 it("marks an added key", () => {
  const root = buildDiff({}, { dedupeDirectDeps: true }, meta());
  expect(child(root, "dedupeDirectDeps")?.kind).toBe("added");
 });

 it("marks a changed scalar with before/after", () => {
  const root = buildDiff({ catalogMode: "strict" }, { catalogMode: "manual" }, meta());
  const n = child(root, "catalogMode");
  expect(n?.kind).toBe("changed");
  expect(n?.before).toBe("strict");
  expect(n?.after).toBe("manual");
 });

 it("marks an unchanged key", () => {
  const root = buildDiff({ catalogMode: "manual" }, { catalogMode: "manual" }, meta());
  expect(child(root, "catalogMode")?.kind).toBe("unchanged");
 });

 it("tags an unmanaged top-level key present only via the file", () => {
  const root = buildDiff({ packages: ["a/*"] }, { packages: ["a/*"] }, meta());
  expect(child(root, "packages")?.tag).toBe("unmanaged");
 });

 it("tags a local override (orthogonal to change kind)", () => {
  const root = buildDiff(
   { catalogMode: "manual" },
   { catalogMode: "manual" },
   meta({ localKeys: new Set(["catalogMode"]) }),
  );
  const n = child(root, "catalogMode");
  expect(n?.tag).toBe("local");
  expect(n?.kind).toBe("unchanged");
 });

 it("recurses into objects (catalogs) and reports a changed leaf", () => {
  const root = buildDiff(
   { catalogs: { default: { react: "^19.0.0" } } },
   { catalogs: { default: { react: "^19.2.0" } } },
   meta(),
  );
  const cat = child(root, "catalogs");
  const def = (cat?.children ?? []).find((c) => c.key === "default");
  const react = (def?.children ?? []).find((c) => c.key === "react");
  expect(react?.kind).toBe("changed");
  expect(react?.before).toBe("^19.0.0");
  expect(react?.after).toBe("^19.2.0");
 });

 it("renders a wholly-added object as a branch of all-added leaves", () => {
  const root = buildDiff({}, { catalogs: { default: { react: "^19.2.0" } } }, meta());
  const cat = child(root, "catalogs");
  expect(cat?.kind).toBe("added");
  const def = (cat?.children ?? []).find((c) => c.key === "default");
  const react = (def?.children ?? []).find((c) => c.key === "react");
  expect(react?.kind).toBe("added");
 });

 it("set-diffs arrays into added/removed/unchanged element nodes", () => {
  const root = buildDiff({ onlyBuiltDependencies: ["esbuild", "swc"] }, { onlyBuiltDependencies: ["esbuild", "sharp"] }, meta());
  const arr = child(root, "onlyBuiltDependencies");
  const kinds = Object.fromEntries((arr?.children ?? []).map((c) => [c.key, c.kind]));
  expect(kinds.esbuild).toBe("unchanged");
  expect(kinds.sharp).toBe("added");
  expect(kinds.swc).toBe("removed");
 });
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `pnpm vitest run package/__test__/cli/diff-build.test.ts`
Expected: FAIL — cannot find `build.js`.

- [ ] **Step 4: Write `build.ts`**

```ts
import type { ChangeKind, DiffMeta, DiffNode } from "./types.js";

function isObject(v: unknown): v is Record<string, unknown> {
 return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Worst kind among children: changed if any differs, added/removed if uniform, else unchanged. */
function rollup(children: readonly DiffNode[]): ChangeKind {
 if (children.length === 0) return "unchanged";
 if (children.every((c) => c.kind === "added")) return "added";
 if (children.every((c) => c.kind === "removed")) return "removed";
 return children.some((c) => c.kind !== "unchanged") ? "changed" : "unchanged";
}

/** Build every node under a value that exists only on one side (added or removed). */
function uniform(key: string, path: readonly string[], value: unknown, kind: "added" | "removed", tag?: DiffNode["tag"]): DiffNode {
 const here = [...path, key];
 const side = kind === "added" ? { after: value } : { before: value };
 if (isObject(value)) {
  const children = Object.keys(value).map((k) => uniform(k, here, value[k], kind));
  return { key, path: here, kind, ...(tag ? { tag } : {}), children };
 }
 if (Array.isArray(value)) {
  const children = value.map((el) => uniform(String(el), here, el, kind));
  return { key, path: here, kind, ...(tag ? { tag } : {}), children };
 }
 return { key, path: here, kind, ...(tag ? { tag } : {}), ...side };
}

/** Diff two arrays as sets keyed by stringified element. */
function diffArray(key: string, path: readonly string[], before: readonly unknown[], after: readonly unknown[], tag?: DiffNode["tag"]): DiffNode {
 const here = [...path, key];
 const b = new Set(before.map(String));
 const a = new Set(after.map(String));
 const keys = [...new Set([...b, ...a])].sort((x, y) => x.localeCompare(y));
 const children: DiffNode[] = keys.map((el) => {
  const inB = b.has(el);
  const inA = a.has(el);
  const kind: ChangeKind = inB && inA ? "unchanged" : inA ? "added" : "removed";
  const side = inA ? { after: el } : { before: el };
  return { key: el, path: [...here, el], kind, ...side };
 });
 return { key, path: here, kind: rollup(children), ...(tag ? { tag } : {}), children };
}

function diffValue(key: string, path: readonly string[], before: unknown, after: unknown, tag?: DiffNode["tag"]): DiffNode {
 const here = [...path, key];
 if (isObject(before) && isObject(after)) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((x, y) => x.localeCompare(y));
  const children = keys.map((k) => {
   if (!(k in before)) return uniform(k, here, after[k], "added");
   if (!(k in after)) return uniform(k, here, before[k], "removed");
   return diffValue(k, here, before[k], after[k]);
  });
  return { key, path: here, kind: rollup(children), ...(tag ? { tag } : {}), children };
 }
 if (Array.isArray(before) && Array.isArray(after)) {
  return diffArray(key, path, before, after, tag);
 }
 const same = JSON.stringify(before) === JSON.stringify(after);
 return {
  key,
  path: here,
  kind: same ? "unchanged" : "changed",
  ...(tag ? { tag } : {}),
  before,
  after,
 };
}

/**
 * Compare two canonicalized workspace objects into a diff tree. Top-level keys
 * carry a `tag`: `local` when the key was sourced from `config.local`,
 * `unmanaged` when the key is not in the plugin-managed set.
 *
 * @internal
 */
export function buildDiff(
 before: Record<string, unknown>,
 after: Record<string, unknown>,
 meta: DiffMeta,
): DiffNode {
 const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((x, y) => x.localeCompare(y));
 const children = keys.map((k) => {
  const tag: DiffNode["tag"] | undefined = meta.localKeys.has(k)
   ? "local"
   : meta.managedKeys.has(k)
    ? undefined
    : "unmanaged";
  if (!(k in before)) return uniform(k, [], after[k], "added", tag);
  if (!(k in after)) return uniform(k, [], before[k], "removed", tag);
  return diffValue(k, [], before[k], after[k], tag);
 });
 return { key: "", path: [], kind: rollup(children), children };
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm vitest run package/__test__/cli/diff-build.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/diff/types.ts package/src/cli/diff/build.ts package/__test__/cli/diff-build.test.ts
git commit -m "feat(cli): add structured diff model for export preview

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 5: `renderExportDiff` (tree → StyledLine[])

**Files:**

- Create: `package/src/cli/diff/render.ts`
- Test: `package/__test__/cli/diff-render.test.ts`

**Interfaces:**

- Consumes: `DiffNode` (Task 4), `StyledLine`/`ChangeStyle` (Task 1).
- Produces: `renderExportDiff(root: DiffNode, opts: { full: boolean }): StyledLine[]`.

Rules: skip the synthetic root; YAML-shaped lines indented by `path.length - 1`. Scalar leaf: `changed` → `key: before → after` (gutter `~`, style changed); `added` → `key: value` (gutter `+`); `removed` → gutter `-`; `unchanged` → gutter ` `. Branch: a header line `key:` colored by its kind, then its children one indent deeper. Array element leaves render as `- value`. The `tag` is carried on the branch/leaf header line. Default (`full:false`): drop `unchanged` leaves that are not within `CONTEXT` (=2) lines of a change at the same parent; collapse dropped runs into a single ` ` line `… N unchanged`. `full:true`: emit every line.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildDiff } from "../../src/cli/diff/build.js";
import { renderExportDiff } from "../../src/cli/diff/render.js";
import type { DiffMeta } from "../../src/cli/diff/types.js";

const meta: DiffMeta = { localKeys: new Set(), managedKeys: new Set(["catalogMode", "dedupeDirectDeps", "catalogs"]) };
const plain = (lines: ReturnType<typeof renderExportDiff>) =>
 lines.map((l) => `${l.gutter} ${"  ".repeat(l.indent)}${l.segments.map((s) => s.text).join("")}${l.tag ? `  (${l.tag})` : ""}`);

describe("renderExportDiff", () => {
 it("renders a changed scalar inline with a ~ gutter", () => {
  const root = buildDiff({ catalogMode: "strict" }, { catalogMode: "manual" }, meta);
  expect(plain(renderExportDiff(root, { full: true }))).toContain("~ catalogMode: strict → manual");
 });

 it("renders an added scalar with a + gutter", () => {
  const root = buildDiff({}, { dedupeDirectDeps: true }, meta);
  expect(plain(renderExportDiff(root, { full: true }))).toContain("+ dedupeDirectDeps: true");
 });

 it("renders an added object as a block", () => {
  const root = buildDiff({}, { catalogs: { default: { react: "^19.2.0" } } }, meta);
  const out = plain(renderExportDiff(root, { full: true }));
  expect(out).toContain("+ catalogs:");
  expect(out).toContain("+     react: ^19.2.0");
 });

 it("collapses far unchanged keys by default but keeps them with full", () => {
  const before = { a1: "x", a2: "x", a3: "x", a4: "x", catalogMode: "strict" };
  const after = { a1: "x", a2: "x", a3: "x", a4: "x", catalogMode: "manual" };
  const m: DiffMeta = { localKeys: new Set(), managedKeys: new Set(["a1", "a2", "a3", "a4", "catalogMode"]) };
  const root = buildDiff(before, after, m);
  const dflt = plain(renderExportDiff(root, { full: false }));
  expect(dflt.some((l) => l.includes("unchanged"))).toBe(true);
  const full = plain(renderExportDiff(root, { full: true }));
  expect(full.filter((l) => l.startsWith("  ")).length).toBeGreaterThan(dflt.filter((l) => l.startsWith("  ")).length);
 });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm vitest run package/__test__/cli/diff-render.test.ts`
Expected: FAIL — cannot find `render.js`.

- [ ] **Step 3: Write `render.ts`**

```ts
import type { ChangeStyle, DiffTag, Segment, StyledLine } from "../ui/styled.js";
import type { ChangeKind, DiffNode } from "./types.js";

const CONTEXT = 2;
const GUTTER: Record<ChangeKind, StyledLine["gutter"]> = {
 added: "+",
 removed: "-",
 changed: "~",
 unchanged: " ",
};
const STYLE: Record<ChangeKind, ChangeStyle> = {
 added: "added",
 removed: "removed",
 changed: "changed",
 unchanged: "unchanged",
};

function scalarText(v: unknown): string {
 return typeof v === "string" ? v : JSON.stringify(v);
}

/** A flat line plus whether it is a "real" change (drives context collapsing). */
interface Flat {
 readonly line: StyledLine;
 readonly changed: boolean;
}

function flatten(node: DiffNode, depth: number): Flat[] {
 const indent = depth;
 const gutter = GUTTER[node.kind];
 const style = STYLE[node.kind];
 const tag: DiffTag | undefined = node.tag;
 const changed = node.kind !== "unchanged";

 // Array element leaf: childless, and its key is the stringified element value.
 const isArrayEl = !node.children && node.key === scalarText(node.after ?? node.before);

 if (node.children) {
  const header: Segment[] = [{ text: `${node.key}:`, style }];
  const self: Flat = { line: { indent, gutter, segments: header, ...(tag ? { tag } : {}) }, changed };
  const kids = node.children.flatMap((c) => flatten(c, depth + 1));
  return [self, ...kids];
 }

 let text: string;
 if (node.kind === "changed") text = `${node.key}: ${scalarText(node.before)} → ${scalarText(node.after)}`;
 else if (isArrayEl) text = `- ${node.key}`;
 else text = `${node.key}: ${scalarText(node.after ?? node.before)}`;

 return [{ line: { indent, gutter, segments: [{ text, style }], ...(tag ? { tag } : {}) }, changed }];
}

/**
 * Render a diff tree to styled lines in canonical-YAML shape. Default collapses
 * unchanged lines outside a 2-line window around changes into a single
 * "… N unchanged" marker; `full` keeps every line.
 *
 * @internal
 */
export function renderExportDiff(root: DiffNode, opts: { full: boolean }): StyledLine[] {
 const flats = (root.children ?? []).flatMap((c) => flatten(c, 0));
 if (opts.full) return flats.map((f) => f.line);

 // keep any line within CONTEXT of a changed line
 const keep = new Array<boolean>(flats.length).fill(false);
 flats.forEach((f, i) => {
  if (!f.changed) return;
  for (let j = Math.max(0, i - CONTEXT); j <= Math.min(flats.length - 1, i + CONTEXT); j++) keep[j] = true;
 });

 const out: StyledLine[] = [];
 let dropped = 0;
 const flushDropped = () => {
  if (dropped > 0) {
   out.push({ indent: 0, gutter: " ", segments: [{ text: `… ${dropped} unchanged`, style: "unchanged" }] });
   dropped = 0;
  }
 };
 flats.forEach((f, i) => {
  if (keep[i]) {
   flushDropped();
   out.push(f.line);
  } else {
   dropped++;
  }
 });
 flushDropped();
 return out;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run package/__test__/cli/diff-render.test.ts`
Expected: PASS (4 tests). If the `isArrayEl` heuristic misfires for a case, simplify: treat a childless node whose `key === scalarText(after ?? before)` and whose parent kind is array as an element — but the tests above do not exercise array elements, so keep the implementation minimal and adjust only if a later integration test needs it.

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/diff/render.ts package/__test__/cli/diff-render.test.ts
git commit -m "feat(cli): render export diff tree to styled lines with context collapsing

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 6: Wire `export --preview` to the colored diff

**Files:**

- Modify: `package/src/cli/commands/export.ts`
- Test: `package/__test__/cli/export.int.test.ts`

**Interfaces:**

- Consumes: `canonicalize` (Task 3), `buildDiff`/`DiffMeta` (Task 4), `renderExportDiff` (Task 5), `toAnsi` (Task 1), `detectCapabilities` (Task 2), `WORKSPACE_FIELDS` (existing).
- Produces: `runExport` returns `{ path; rendered; written; diff }` where `diff: StyledLine[]`. New `--full` option on `exportCommand`.

- [ ] **Step 1: Add a failing integration assertion** (append to `export.int.test.ts`)

```ts
import { toAnsi } from "../../src/cli/ui/ansi.js";

it("--preview returns a styled diff with added/unmanaged lines", async () => {
 const { configFile, workspacePath } = setup("packages:\n  - pkg/*\n");
 const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: true, full: true }));
 expect(res.written).toBe(false);
 expect(Array.isArray(res.diff)).toBe(true);
 const text = toAnsi(res.diff, { color: false });
 // publicHoistPattern comes from local override -> tagged local
 expect(text).toContain("(local)");
 // packages is unmanaged -> tagged unmanaged
 expect(text).toContain("packages");
 expect(text).toContain("(unmanaged)");
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm vitest run package/__test__/cli/export.int.test.ts`
Expected: FAIL — `runExport` has no `full`/`diff`.

- [ ] **Step 3: Edit `export.ts`**

Add imports near the top, and add `canonicalize` to the EXISTING `workspace-file.js` import line (do not create a second import from that module — Biome forbids it):

```ts
import { buildDiff } from "../diff/build.js";
import type { DiffNode } from "../diff/types.js";
import { renderExportDiff } from "../diff/render.js";
import { detectCapabilities } from "../ui/env.js";
import { toAnsi } from "../ui/ansi.js";
import type { StyledLine } from "../ui/styled.js";
// existing line becomes:
import { canonicalize, findWorkspaceFile, parseWorkspace, renderWorkspace } from "../workspace-file.js";
```

Change the `runExport` signature and preview branch. Replace the options type and the body around the `merged`/`rendered`/preview lines:

```ts
export function runExport(opts: {
 configFile: string;
 workspacePath?: string;
 preview: boolean;
 full?: boolean;
}): Effect.Effect<{ path: string; rendered: string; written: boolean; diff: StyledLine[] }, ExportError> {
```

After `const merged = overlayWorkspace(managed, parsed);` and `const rendered = renderWorkspace(merged);`, build the diff:

```ts
  const localKeys = new Set(
   config.local && typeof config.local === "object" ? Object.keys(config.local as Record<string, unknown>) : [],
  );
  const tree: DiffNode = buildDiff(
   canonicalize(parsed) as Record<string, unknown>,
   canonicalize(merged) as Record<string, unknown>,
   { localKeys, managedKeys: WORKSPACE_FIELDS },
  );
  const diff = renderExportDiff(tree, { full: opts.full ?? false });

  if (opts.preview) return { path, rendered, written: false, diff };
  yield* Effect.try({
   try: () => writeFileSync(path, rendered, "utf8"),
   catch: () => new ExportError({ message: `Cannot write ${path}` }),
  });
  return { path, rendered, written: true, diff };
```

(Note: `config` is in scope from `evaluatePluginConfig` earlier; `config.local` may be `undefined`.)

Add the `--full` option and pass it + render the colored diff in the command:

```ts
const fullFlag = Options.boolean("full").pipe(Options.withDefault(false));

export const exportCommand = Command.make(
 "export",
 { path: pathArg, preview: previewFlag, full: fullFlag },
 ({ path, preview, full }) =>
  Effect.gen(function* () {
   const matches = yield* findConfigFiles(process.cwd());
   const picked = pickConfigCandidate(matches);
   if (!picked.ok) return yield* Effect.fail(new ExportError({ message: picked.message }));
   const workspacePath = Option.getOrUndefined(path);
   const result = yield* runExport({
    configFile: picked.file,
    ...(workspacePath !== undefined ? { workspacePath } : {}),
    preview,
    full,
   });
   yield* Effect.sync(() => {
    if (preview) {
     const caps = detectCapabilities();
     process.stdout.write(`${result.path} (preview — not written)\n\n`);
     process.stdout.write(`${toAnsi(result.diff, { color: caps.color })}\n`);
     process.stdout.write("\n+ added  ~ changed  - removed  · local  ░ unmanaged\n");
    } else process.stdout.write(`Exported to ${result.path}\n`);
   });
  }),
).pipe(Command.withDescription("Export the plugin config into pnpm-workspace.yaml"));
```

- [ ] **Step 4: Update the pre-existing `--preview writes nothing` test**

That test asserts `res.rendered` contains `publicHoistPattern`. `rendered` still exists, so it passes unchanged. No edit needed unless TypeScript flags the missing `full` — it is optional, so calls without it compile.

- [ ] **Step 5: Run the export integration**

Run: `pnpm vitest run package/__test__/cli/export.int.test.ts`
Expected: PASS (all, including the new diff assertion).

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package/src/cli/commands/export.ts package/__test__/cli/export.int.test.ts
git commit -m "feat(cli): render export --preview as a colored canonical diff with --full

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Phase 3 — upgrade integration

### Task 7: `summaryLines` + colorized `renderSummary`

**Files:**

- Modify: `package/src/cli/summary.ts`
- Test: `package/__test__/cli/summary.test.ts`

**Interfaces:**

- Consumes: `StyledLine` (Task 1), `Decision` (existing).
- Produces: `summaryLines(decisions, interop?): StyledLine[]`; `renderSummary(decisions, interop?, opts?: { color?: boolean }): string` = `toAnsi(summaryLines(...), { color: opts?.color ?? false })`. Existing call sites passing `(decisions)` / `(decisions, interop)` keep working (color defaults off).

The plain output (color off) MUST preserve today's substrings so existing assertions hold: `<catalog> › <pkg>  <from> → <to>`, `↳ peer  <a> → <b>`, `(resync peer)`, `(materialize peer)`, `↳ peer (new)  → <x>`, the tally `N to update · …`, `↓ <pkg>  <from> → <to>`, `⚠ <pkg> …`.

- [ ] **Step 1: Replace `summary.ts` body** (keep the two interfaces at the top unchanged; rewrite `renderSummary`)

```ts
import { toAnsi } from "./ui/ansi.js";
import type { StyledLine } from "./ui/styled.js";
import type { Decision } from "./walk-types.js";

// ... keep InteropAdjustment + InteropSummary interfaces exactly as they are ...

/**
 * Build the pending-decisions summary as styled lines: one line per real
 * change, peer changes indented, a dim tally, then interop adjustments and
 * conflicts. Pure; color is applied by `renderSummary`/`toAnsi`.
 *
 * @internal
 */
export function summaryLines(decisions: readonly Decision[], interop?: InteropSummary): StyledLine[] {
 const lines: StyledLine[] = [];
 let toUpdate = 0;
 let major = 0;
 let resync = 0;
 let materialize = 0;
 let upToDate = 0;
 for (const { item, chosen } of decisions) {
  const { entry } = item;
  if (chosen.kind !== "keep") {
   toUpdate++;
   if (chosen.isMajor) major++;
   lines.push({
    indent: 0,
    gutter: "~",
    segments: [{ text: `${entry.catalog} › ${entry.pkg}  ${entry.currentRange} → ${chosen.range}`, style: "changed" }],
   });
   if (entry.peer && chosen.peerRange && chosen.peerRange !== entry.peer.value) {
    lines.push({ indent: 1, gutter: "~", segments: [{ text: `↳ peer  ${entry.peer.value} → ${chosen.peerRange}`, style: "changed" }] });
   } else if (!entry.peer && entry.strategy && chosen.peerRange) {
    lines.push({ indent: 1, gutter: "+", segments: [{ text: `↳ peer (new)  → ${chosen.peerRange}`, style: "added" }] });
    materialize++;
   }
  } else if (entry.peer && item.driftPeer) {
   resync++;
   lines.push({ indent: 0, gutter: "~", segments: [{ text: `${entry.catalog} › ${entry.pkg}  (resync peer)`, style: "changed" }] });
   lines.push({ indent: 1, gutter: "~", segments: [{ text: `↳ peer  ${entry.peer.value} → ${item.driftPeer}`, style: "changed" }] });
  } else if (!entry.peer && item.materializePeer) {
   materialize++;
   lines.push({ indent: 0, gutter: "+", segments: [{ text: `${entry.catalog} › ${entry.pkg}  (materialize peer)`, style: "added" }] });
   lines.push({ indent: 1, gutter: "+", segments: [{ text: `↳ peer (new)  → ${item.materializePeer}`, style: "added" }] });
  } else {
   upToDate++;
  }
 }
 lines.push({
  indent: 0,
  gutter: " ",
  segments: [{ text: `${toUpdate} to update · ${major} major · ${resync} resync · ${materialize} new peer · ${upToDate} up to date`, style: "unchanged" }],
 });
 if (interop) {
  for (const a of interop.adjustments) {
   lines.push({ indent: 0, gutter: "~", segments: [{ text: `↓ ${a.pkg}  ${a.from} → ${a.to}`, style: "changed" }] });
   lines.push({ indent: 1, gutter: "~", segments: [{ text: `↳ peer  → ${a.peer}`, style: "changed" }] });
  }
  for (const c of interop.conflicts) {
   lines.push({ indent: 0, gutter: "⚠", segments: [{ text: `${c.pkg} (kept ${c.ceiling}) blocked by ${c.blockedBy}`, style: "warn" }] });
  }
 }
 return lines;
}

/**
 * Render the summary to a string. Color defaults off so non-TTY/test callers
 * get clean text; the upgrade command passes the detected color flag.
 *
 * @internal
 */
export function renderSummary(decisions: readonly Decision[], interop?: InteropSummary, opts?: { color?: boolean }): string {
 return toAnsi(summaryLines(decisions, interop), { color: opts?.color ?? false });
}
```

- [ ] **Step 2: Update the conflict assertion** in `summary.test.ts`

The old conflict line was `⚠ @effect/foo …`; now the `⚠` is the gutter. Change the assertion:

```ts
  expect(text).toContain("⚠ @effect/foo");
```

This still holds: plain render is `⚠ @effect/foo (kept 1.2.0) blocked by effect@^4.0.0`. The adjustment assertion `toContain("↓ @effect/cli  ^0.71.0 → ^0.70.0")` also holds (gutter `~` precedes it). No other edits needed.

- [ ] **Step 3: Run the summary unit tests**

Run: `pnpm vitest run package/__test__/cli/summary.test.ts`
Expected: PASS (all 4). If the `1 new peer` count assertion in "materialized peer on keep" fails, verify the materialize branch increments `materialize` (it does) — the tally text is unchanged.

- [ ] **Step 4: Commit**

```bash
git add package/src/cli/summary.ts package/__test__/cli/summary.test.ts
git commit -m "feat(cli): build upgrade summary as styled lines with optional color

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 8: Walk candidate rows adopt the shared palette

**Files:**

- Modify: `package/src/cli/ui/Walk.ts`
- Test: `package/__test__/cli/walk-ui.test.ts`

**Interfaces:**

- Consumes: `ANSI_OPEN` color names indirectly — Ink uses named colors, so map styles to Ink color names locally.

The Walk renders via Ink `<Text color="...">`. Keep behavior; replace the ad-hoc `cyan`/`major` strings with a small shared mapping so the palette is consistent: selection → `cyan`, `⚠ major` marker → `yellow`. This is a low-risk cosmetic alignment.

- [ ] **Step 1: Inspect the existing walk-ui test**

Run: `pnpm vitest run package/__test__/cli/walk-ui.test.ts`
Expected: PASS (baseline before change).

- [ ] **Step 2: Edit `Walk.ts`** — color the `⚠ major` marker yellow

Replace the `candidateRows` mapping (lines 60-69) so a major candidate's marker is rendered in yellow while keeping the cyan selection cursor:

```ts
 const candidateRows = item.candidates.map((c, i) => {
  const selected = i === state.cursor;
  const cursor = selected ? "❯ " : "  ";
  const base = c.kind === "keep" ? `keep ${c.range}` : `${c.range}   ${c.kind}`;
  const colorProps = selected ? ({ color: "cyan" } as const) : c.isMajor ? ({ color: "yellow" } as const) : {};
  const text = c.kind === "keep" ? `${cursor}${base}` : `${cursor}${base}${c.isMajor ? "  ⚠ major" : ""}`;
  return createElement(Text, { key: c.kind, ...colorProps }, text);
 });
```

- [ ] **Step 3: Run the walk-ui test**

Run: `pnpm vitest run package/__test__/cli/walk-ui.test.ts`
Expected: PASS. If the test asserts exact strings that changed, update those assertions to match the text above (the visible label text is unchanged; only color props differ, which ink-testing-library renders as the same plain text).

- [ ] **Step 4: Commit**

```bash
git add package/src/cli/ui/Walk.ts package/__test__/cli/walk-ui.test.ts
git commit -m "feat(cli): color major upgrade candidates yellow in the walk

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 9: `upgrade --preview`, `--full`, color, and non-TTY fallback

**Files:**

- Modify: `package/src/cli/commands/upgrade.ts`
- Test: `package/__test__/cli/upgrade.int.test.ts`

**Interfaces:**

- Consumes: `detectCapabilities` (Task 2), `renderSummary` color option (Task 7), existing `runUpgrade`/`buildWalkItems`/`runWalk`.
- Produces: new `--preview` and `--full` options; a `previewSummary(items, full)` helper building the projected `Decision[]`; non-interactive fallback when `!capabilities.interactive`.

`upgrade --preview`: build walk items, project each to its in-range candidate (or a keep with drift/materialize), render `renderSummary` with color, exit. No write. Respect `--full` by also emitting up-to-date items (a keep decision) so they appear; default omits them (the projection naturally drops them).

Non-TTY fallback: when `!yes && !dryRun && !preview` and `!detectCapabilities().interactive`, run the same projection as `--preview` instead of `runWalk` (which would hang awaiting raw-mode input).

- [ ] **Step 1: Add a failing integration test** (append to `upgrade.int.test.ts`, mirroring its existing setup with `stub-resolver`)

```ts
it("--preview projects in-range bumps without writing", async () => {
 // Reuse this file's existing config + stub-resolver setup helpers.
 const { file, resolver, before } = setupUpgrade({
  config: `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ catalogs: { silk: { packages: { typescript: "^5.9.0" } } } });
`,
  versions: { typescript: ["5.9.0", "5.9.3"] },
 });
 const out = await runUpgradePreview({ file, resolver, full: false }); // see Step 3 helper
 expect(out).toContain("typescript");
 expect(out).toContain("→");
 expect(readFileSync(file, "utf8")).toBe(before); // nothing written
});
```

If `upgrade.int.test.ts` has no reusable `setupUpgrade`/preview entry, adapt to its actual helpers (it already constructs a temp config + a stub `Resolver`); the assertion that matters is: a projected summary string is produced and the file is unchanged.

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm vitest run package/__test__/cli/upgrade.int.test.ts`
Expected: FAIL — no preview entry point.

- [ ] **Step 3: Edit `upgrade.ts`** — add a pure projection helper + exported preview core

Add imports (and add `WalkItem` to the EXISTING `walk-types.js` type import, which currently imports only `Decision`):

```ts
import { detectCapabilities } from "../ui/env.js";
// existing line becomes:
import type { Decision, WalkItem } from "../walk-types.js";
```

Add a projection helper (reuses the `--dry-run` mapping already in the command) and an exported testable preview core near `runUpgrade`:

```ts
/** Project walk items to the non-interactive default decisions (latest-in-range, plus peer-only keeps). @internal */
export function projectDecisions(items: readonly WalkItem[], full: boolean): Decision[] {
 const out: Decision[] = [];
 for (const i of items) {
  const inRange = i.candidates.find((c) => c.kind === "in-range");
  if (inRange) {
   out.push({ item: i, chosen: inRange });
   continue;
  }
  if (i.driftPeer !== null || i.materializePeer !== null) {
   const keep = i.candidates.find((c) => c.kind === "keep");
   if (keep) {
    out.push({ item: i, chosen: keep });
    continue;
   }
  }
  if (full) {
   const keep = i.candidates.find((c) => c.kind === "keep");
   if (keep) out.push({ item: i, chosen: keep });
  }
 }
 return out;
}

/** Build the colored preview summary string without writing. @internal */
export function runUpgradePreview(opts: { file: string; resolver: Resolver; full: boolean; color?: boolean }): Effect.Effect<string, UpgradeError> {
 return Effect.gen(function* () {
  const source = yield* Effect.try({
   try: () => readFileSync(opts.file, "utf8"),
   catch: () => new UpgradeError({ message: `Cannot read ${opts.file}` }),
  });
  const discovered = yield* Effect.try({
   try: () => discoverCatalogEntries(source, opts.file),
   catch: (e) => new UpgradeError({ message: String(e) }),
  });
  const gate = yield* computeGate(source, opts.file, opts.resolver);
  const versions = yield* resolveGatedVersions(discovered.entries, opts.resolver, gate, Date.now());
  const items = yield* buildWalkItems(discovered.entries, versions).pipe(
   Effect.catchAll((e) => Effect.fail(new UpgradeError({ message: e.message }))),
  );
  return renderSummary(projectDecisions(items, opts.full), undefined, { color: opts.color ?? false });
 });
}
```

In the command, add the options and wire preview + fallback. Add:

```ts
const previewFlag = Options.boolean("preview").pipe(Options.withDefault(false));
const fullFlag = Options.boolean("full").pipe(Options.withDefault(false));
```

Update `Command.make("upgrade", { file: fileArg, yes: yesFlag, dryRun: dryRunFlag, catalog: catalogOption, preview: previewFlag, full: fullFlag }, ({ file: fileOpt, yes, dryRun, catalog, preview, full }) => ...)`.

Right after `const resolver = yield* RegistryResolver;`, before the `if (yes)` block, add the preview branch and capability check:

```ts
    const caps = detectCapabilities();
    if (preview) {
     const text = yield* runUpgradePreview({ file, resolver, full, color: caps.color });
     yield* Effect.sync(() => process.stdout.write(`${text}\n`));
     return;
    }
```

Change the existing `--dry-run` `renderSummary(decisions)` call to pass color:

```ts
     yield* Effect.sync(() => process.stdout.write(`${renderSummary(decisions, undefined, { color: caps.color })}\n`));
```

Guard the interactive walk: replace `const decisions = yield* runWalk(items);` with a fallback when not interactive:

```ts
    if (!caps.interactive) {
     const text = renderSummary(projectDecisions(items, full), undefined, { color: caps.color });
     yield* Effect.sync(() =>
      process.stdout.write(`${text}\n\n(non-interactive terminal — run with --yes to apply, or in a TTY to choose)\n`),
     );
     return;
    }
    const decisions = yield* runWalk(items);
```

And update the final post-walk `renderSummary(decisions, { adjustments, conflicts: allConflicts })` call to pass color:

```ts
    yield* Effect.sync(() =>
     process.stdout.write(`${renderSummary(decisions, { adjustments, conflicts: allConflicts }, { color: caps.color })}\n`),
    );
```

- [ ] **Step 4: Run the upgrade integration tests**

Run: `pnpm vitest run package/__test__/cli/upgrade.int.test.ts`
Expected: PASS (existing + new preview test). Existing dry-run assertions use `toContain` on substrings preserved by Task 7.

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/commands/upgrade.ts package/__test__/cli/upgrade.int.test.ts
git commit -m "feat(cli): add upgrade --preview/--full, color, and non-TTY fallback

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Final verification

- [ ] **Run the full CLI test suite**

Run: `pnpm vitest run package/__test__/cli`
Expected: all PASS.

- [ ] **Run the whole suite + typecheck + lint**

Run: `pnpm run typecheck && pnpm run test && pnpm run lint`
Expected: green.

- [ ] **Manual smoke (in a real TTY)**

Run from the dogfooding consumer (`../../savvy-web/pnpm-plugin-silk`):

```bash
rolldown-pnpm-config export --preview          # colored, changes+context
rolldown-pnpm-config export --preview --full   # whole canonical tree
rolldown-pnpm-config upgrade --preview         # projected colored range diff
```

Expected: colored output with gutters/tags; `--preview` writes nothing.

---

## Notes / out of scope

- The root-cause `upgrade` hang (if it reproduces on a real TTY) is a separate systematic-debugging task; this plan only adds the non-TTY fallback that prevents the hang in CI/agent/piped contexts.
- The interactive Ink `<DiffView>` (navigate / collapse / write) is phase 2 and reuses `StyledLine[]`.
- OSC-8 hyperlinks (`link` from `ui/env.ts`) are available but not yet wired into output; a follow-up can linkify the export header path and upgrade package names gated on `caps.hyperlinks`.
