# Dependency Patch Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a plugin author distribute pnpm dependency patches through their config-dependency plugin by dropping `.patch` files into convention folders; the plugin rewrites patch path strings between the local on-disk location and the consumer-side `node_modules/.pnpm-config/<name>/` location, scoped per-plugin so multiple config-deps and the repo's own patches coexist.

**Architecture:** A new pure module `package/src/patches/` does filename→key derivation, the local→distributed path rewrite, and filesystem discovery of the two convention folders (`patches/` local-only, `public/patches/` distributed). At build time `withResolvedBuildPatches` runs discovery and injects the rewritten distributed map into the config before `freeze` (so `base.patchedDependencies` carries `.pnpm-config` paths; `freeze` stays pure-data). At export time `runExport` runs the same discovery but writes **local** paths, merged by key into the existing `pnpm-workspace.yaml` so sibling plugins' and repo-own entries survive. `mapChildWins` then reconciles local-vs-distributed at install. No new merge engine; the descriptor table is untouched.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, Effect Schema, `@effect/cli`, Vitest (forks pool), Biome, `yaml`.

**Spec:** `.claude/design/rolldown-pnpm-config/specs/2026-06-30-patch-distribution-design.md`

## Global Constraints

- **ESM imports:** relative imports MUST use `.js` extensions; Node built-ins MUST use `node:` protocol (`node:fs`, `node:path`, `node:os`, `node:url`).
- **Type imports:** type-only imports MUST use `import type { … }` (verbatimModuleSyntax).
- **exactOptionalPropertyTypes** is on: never assign `undefined` to an optional property; use conditional spread `...(x !== undefined ? { k: x } : {})`.
- **Formatting:** tabs (width 2), 120-col; Biome auto-formats on commit — do not hand-format.
- **Tests** live only under `package/__test__/`, never co-located in `src/`. Classification is by filename: `*.test.ts` (unit), `*.int.test.ts` (integration), `*.e2e.test.ts` (e2e). `utils/` and `fixtures/` subdirs are excluded from discovery.
- **Test runner:** plain Vitest (`import { describe, expect, it } from "vitest"`); run Effect inside `it` via `Effect.runPromise(...)` / `Effect.runSync(...)`.
- **Effect at build time only:** the runtime bundle imports nothing external. The new `patches/` module is build/CLI-side only; it must never be imported by `package/src/runtime/**`.
- **The distributed prefix** is `node_modules/.pnpm-config/<name>/<rel>` with POSIX separators — this is the one fact to verify against a real install (Task 1) before relying on it.
- **Commits:** Conventional Commits + DCO signoff `Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>` on every commit. Run `pnpm run typecheck` before committing code tasks.

---

### Task 1: Verify the config-dependency on-disk path (no code)

The whole rewrite assumes a config-dependency named `<name>` installs at `node_modules/.pnpm-config/<name>/` in a consumer, so a file shipped at `<pkg>/patches/x.patch` resolves at `node_modules/.pnpm-config/<name>/patches/x.patch`. Confirm this for a **scoped** name before coding the rewrite.

**Files:** none (investigation only).

- [ ] **Step 1: Inspect a real install**

Run (from the repo root):

```bash
pnpm install >/dev/null 2>&1 || true
find . -type d -path '*/node_modules/.pnpm-config/*' -maxdepth 6 2>/dev/null | head -20
```

Expected: a directory whose tail is `.pnpm-config/<scoped-name>/…`. Record the exact layout for a scoped name (e.g. is it `.pnpm-config/@scope/pkg/` or a flattened `.pnpm-config/@scope+pkg/`?).

- [ ] **Step 2: If the layout differs from `.pnpm-config/<name>/`, record the real shape**

Write the confirmed prefix as a one-line comment to paste into `package/src/patches/paths.ts` (Task 3). If it is exactly `node_modules/.pnpm-config/<name>/`, proceed unchanged. If a scoped name is flattened (`/`→`+` or similar), Task 3's `distributedPatchPath` must encode that transform — adjust that one function only.

- [ ] **Step 3: No commit** (investigation only). Note findings in the Task 3 commit message.

---

### Task 2: Filename → key derivation

**Files:**

- Create: `package/src/patches/keys.ts`
- Test: `package/__test__/patches/keys.test.ts`

**Interfaces:**

- Produces: `patchKeyFromFileName(fileName: string): string | null` — reverses pnpm's `/`→`__` filename mangling; returns `null` for non-`.patch` names.

- [ ] **Step 1: Write the failing test**

```typescript
// package/__test__/patches/keys.test.ts
import { describe, expect, it } from "vitest";
import { patchKeyFromFileName } from "../../src/patches/keys.js";

describe("patchKeyFromFileName", () => {
 it("derives an exact-version key", () => {
  expect(patchKeyFromFileName("is-odd@3.0.1.patch")).toBe("is-odd@3.0.1");
 });
 it("unmangles a scoped name's __ back to /", () => {
  expect(patchKeyFromFileName("@scope__pkg@1.0.0.patch")).toBe("@scope/pkg@1.0.0");
 });
 it("derives a bare (all-versions) key", () => {
  expect(patchKeyFromFileName("react.patch")).toBe("react");
 });
 it("returns null for a non-.patch file", () => {
  expect(patchKeyFromFileName("notes.txt")).toBeNull();
 });
 it("returns null for an empty stem", () => {
  expect(patchKeyFromFileName(".patch")).toBeNull();
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/patches/keys.test.ts`
Expected: FAIL — cannot resolve `../../src/patches/keys.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// package/src/patches/keys.ts
/**
 * Derive the `patchedDependencies` key from a `.patch` filename, reversing pnpm's
 * `/`→`__` mangling (`@scope__pkg@1.0.0.patch` → `@scope/pkg@1.0.0`). Returns
 * `null` when the name does not end in `.patch` or has an empty stem.
 *
 * @internal
 */
export function patchKeyFromFileName(fileName: string): string | null {
 const SUFFIX = ".patch";
 if (!fileName.endsWith(SUFFIX)) return null;
 const stem = fileName.slice(0, -SUFFIX.length);
 if (stem.length === 0) return null;
 return stem.replace(/__/g, "/");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/patches/keys.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/patches/keys.ts package/__test__/patches/keys.test.ts
git commit -m "$(printf 'feat(patches): derive patchedDependencies key from filename\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

### Task 3: Distributed path rewrite

**Files:**

- Create: `package/src/patches/paths.ts`
- Test: `package/__test__/patches/paths.test.ts`

**Interfaces:**

- Produces:
  - `distributedPatchPath(name: string, rel: string): string` — `node_modules/.pnpm-config/<name>/<rel>`, POSIX separators.
  - `distributedRel(baseDir: string, distRoot: string, fileName: string): string` — the patch's path relative to the bundler's `public/` dir (e.g. `patches/is-odd@3.0.1.patch`), falling back to `<basename(distRoot)>/<fileName>` when `distRoot` is outside `public/`.

- [ ] **Step 1: Write the failing test**

```typescript
// package/__test__/patches/paths.test.ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { distributedPatchPath, distributedRel } from "../../src/patches/paths.js";

describe("distributedPatchPath", () => {
 it("builds the .pnpm-config consumer path for a scoped name", () => {
  expect(distributedPatchPath("@example/savvy", "patches/is-odd@3.0.1.patch")).toBe(
   "node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch",
  );
 });
 it("uses POSIX separators regardless of input", () => {
  expect(distributedPatchPath("cfg", "patches\\a.patch")).toBe("node_modules/.pnpm-config/cfg/patches/a.patch");
 });
});

describe("distributedRel", () => {
 const base = join("/repo", "examples", "savvy");
 it("returns the path relative to public/ for the default dist root", () => {
  expect(distributedRel(base, join(base, "public", "patches"), "is-odd@3.0.1.patch")).toBe(
   "patches/is-odd@3.0.1.patch",
  );
 });
 it("honors a public/ subfolder override", () => {
  expect(distributedRel(base, join(base, "public", "foo"), "a.patch")).toBe("foo/a.patch");
 });
 it("falls back to the dist-root basename when outside public/", () => {
  expect(distributedRel(base, join("/elsewhere", "vendor", "patches"), "a.patch")).toBe("patches/a.patch");
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/patches/paths.test.ts`
Expected: FAIL — cannot resolve `../../src/patches/paths.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// package/src/patches/paths.ts
import { basename, join, relative } from "node:path";
import { posix } from "node:path";

/**
 * Consumer-resolved distributed patch path for a config dependency:
 * `node_modules/.pnpm-config/<name>/<rel>`, POSIX separators. `<name>` is used
 * verbatim (a scoped name keeps its `/`). Verify the prefix against a real
 * install — see plan Task 1.
 *
 * @internal
 */
export function distributedPatchPath(name: string, rel: string): string {
 const segments = rel.split(/[\\/]/).filter(Boolean);
 return posix.join("node_modules", ".pnpm-config", name, ...segments);
}

/**
 * The patch's path relative to the bundler's `public/` directory — the subpath
 * the bundler preserves when copying `public/` into `dist/`. Falls back to
 * `<basename(distRoot)>/<fileName>` when `distRoot` is not under `public/`.
 *
 * @internal
 */
export function distributedRel(baseDir: string, distRoot: string, fileName: string): string {
 const publicDir = join(baseDir, "public");
 const rel = relative(publicDir, distRoot);
 const sub = rel === "" || rel.startsWith("..") ? basename(distRoot) : rel;
 return `${sub.split(/[\\/]/).filter(Boolean).join("/")}/${fileName}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/patches/paths.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/patches/paths.ts package/__test__/patches/paths.test.ts
git commit -m "$(printf 'feat(patches): rewrite local patch paths to .pnpm-config consumer paths\n\nVerified config-dependency install prefix against a real install (plan Task 1).\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

### Task 4: Filesystem discovery of the two convention folders

**Files:**

- Create: `package/src/patches/discover.ts`
- Test: `package/__test__/patches/discover.test.ts`

**Interfaces:**

- Consumes: `patchKeyFromFileName` (Task 2), `distributedPatchPath` + `distributedRel` (Task 3).
- Produces:

```typescript
export interface DiscoveredPatch {
 readonly key: string;
 readonly fileName: string;
 readonly distributed: boolean;
 readonly absPath: string;
 readonly distributedPath?: string; // present only when distributed
}
export interface DiscoverPatchesOptions {
 readonly baseDir: string;
 readonly name: string;
 readonly localPatchesDir?: string; // override the distributed source root
}
export function discoverPatches(opts: DiscoverPatchesOptions): readonly DiscoveredPatch[];
```

- [ ] **Step 1: Write the failing test**

```typescript
// package/__test__/patches/discover.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverPatches } from "../../src/patches/discover.js";

let base: string;
beforeEach(() => {
 base = mkdtempSync(join(tmpdir(), "rpc-discover-"));
});
afterEach(() => {
 rmSync(base, { recursive: true, force: true });
});

function touch(rel: string): void {
 const abs = join(base, rel);
 mkdirSync(join(abs, ".."), { recursive: true });
 writeFileSync(abs, "diff\n", "utf8");
}

describe("discoverPatches", () => {
 it("classifies public/patches as distributed and patches/ as local-only", () => {
  touch("public/patches/is-odd@3.0.1.patch");
  touch("patches/react.patch");
  const found = discoverPatches({ baseDir: base, name: "@example/savvy" });

  const dist = found.find((p) => p.key === "is-odd@3.0.1");
  expect(dist).toMatchObject({
   distributed: true,
   distributedPath: "node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch",
  });

  const local = found.find((p) => p.key === "react");
  expect(local?.distributed).toBe(false);
  expect(local?.distributedPath).toBeUndefined();
 });

 it("ignores non-.patch files", () => {
  touch("public/patches/README.md");
  expect(discoverPatches({ baseDir: base, name: "cfg" })).toHaveLength(0);
 });

 it("returns [] when neither folder exists", () => {
  expect(discoverPatches({ baseDir: base, name: "cfg" })).toEqual([]);
 });

 it("honors a localPatchesDir override for the distributed root", () => {
  touch("public/vendored/a.patch");
  const found = discoverPatches({ baseDir: base, name: "cfg", localPatchesDir: "public/vendored" });
  expect(found.find((p) => p.key === "a")).toMatchObject({
   distributed: true,
   distributedPath: "node_modules/.pnpm-config/cfg/vendored/a.patch",
  });
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/patches/discover.test.ts`
Expected: FAIL — cannot resolve `../../src/patches/discover.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// package/src/patches/discover.ts
import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { patchKeyFromFileName } from "./keys.js";
import { distributedPatchPath, distributedRel } from "./paths.js";

/** One discovered patch file, with its derived key and (when distributed) its
 *  consumer-resolved path. @internal */
export interface DiscoveredPatch {
 readonly key: string;
 readonly fileName: string;
 readonly distributed: boolean;
 readonly absPath: string;
 readonly distributedPath?: string;
}

/** @internal */
export interface DiscoverPatchesOptions {
 readonly baseDir: string;
 readonly name: string;
 readonly localPatchesDir?: string;
}

/**
 * Discover owned patches in the two convention folders adjacent to the build
 * file: `public/patches/` (distributed, rewritten) and `patches/` (local-only).
 * `localPatchesDir` overrides the distributed source root only. Read-only.
 *
 * @internal
 */
export function discoverPatches(opts: DiscoverPatchesOptions): readonly DiscoveredPatch[] {
 const distRoot = opts.localPatchesDir
  ? isAbsolute(opts.localPatchesDir)
   ? opts.localPatchesDir
   : join(opts.baseDir, opts.localPatchesDir)
  : join(opts.baseDir, "public", "patches");
 const localOnlyRoot = join(opts.baseDir, "patches");

 const out: DiscoveredPatch[] = [];
 collect(distRoot, true);
 collect(localOnlyRoot, false);
 return out;

 function collect(dir: string, distributed: boolean): void {
  if (!existsSync(dir)) return;
  for (const fileName of readdirSync(dir).sort()) {
   const key = patchKeyFromFileName(fileName);
   if (key === null) continue;
   const absPath = join(dir, fileName);
   out.push({
    key,
    fileName,
    distributed,
    absPath,
    ...(distributed
     ? { distributedPath: distributedPatchPath(opts.name, distributedRel(opts.baseDir, distRoot, fileName)) }
     : {}),
   });
  }
 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/patches/discover.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/patches/discover.ts package/__test__/patches/discover.test.ts
git commit -m "$(printf 'feat(patches): discover patches in patches/ and public/patches/ folders\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

### Task 5: Authoring type changes

**Files:**

- Modify: `package/src/define-plugin.ts:19-23` (LocalDirective), `:46-48` (local object), `:208` (patchedDependencies input)
- Test: `package/__test__/types/patches.test-d.ts`

**Interfaces:**

- Produces (type-level only):
  - `LocalDirective<T>.strategy` widened to `"union" | "difference" | "merge" | "rewrite"`.
  - `PluginConfig.local` gains `localPatchesDir?: string`.
  - `PluginConfig.patchedDependencies` accepts the `{ strategy: "rewrite" }` directive.

- [ ] **Step 1: Write the failing type test**

```typescript
// package/__test__/types/patches.test-d.ts
import type { PluginConfig } from "../../src/define-plugin.js";

// rewrite directive on patchedDependencies
const a: PluginConfig["patchedDependencies"] = { strategy: "rewrite" };
// plain map still allowed
const b: PluginConfig["patchedDependencies"] = { "is-odd@3.0.1": "patches/is-odd.patch" };
// localPatchesDir + merge directive on local
const c: PluginConfig["local"] = {
 localPatchesDir: "public/patches",
 patchedDependencies: { strategy: "merge" },
};
void a;
void b;
void c;
```

- [ ] **Step 2: Run typecheck to verify it fails**

Run: `pnpm run typecheck`
Expected: FAIL — `{ strategy: "rewrite" }` not assignable; `localPatchesDir` not in `local`; `"merge"` not in strategy union.

- [ ] **Step 3: Apply the type changes**

In `package/src/define-plugin.ts`, replace the `LocalDirective` strategy line (currently `readonly strategy?: "union" | "difference";`):

```typescript
 readonly strategy?: "union" | "difference" | "merge" | "rewrite";
```

Replace the `local` object (lines 46-48, currently the mapped type) with:

```typescript
 readonly local?: {
  /**
   * Override the local discovery root for distributed patches (default
   * `public/patches/` adjacent to the build file). The local-only `patches/`
   * folder detection is independent and unaffected.
   */
  readonly localPatchesDir?: string;
 } & {
  readonly [K in keyof PluginConfig]?: PluginConfig[K] | LocalDirective<PluginConfig[K]>;
 };
```

Replace the `patchedDependencies` field declaration (line 208) with:

```typescript
 /**
  * Patches applied to dependencies, keyed by package identifier. Pass a plain
  * map for explicit control, or `{ strategy: "rewrite" }` (the default when
  * `public/patches/` contains files) to auto-discover and rewrite patch paths
  * to their distributed `node_modules/.pnpm-config/<name>/` location.
  */
 readonly patchedDependencies?: FieldInput<Record<string, string>> | { readonly strategy: "rewrite" };
```

- [ ] **Step 4: Run typecheck to verify it passes**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package/src/define-plugin.ts package/__test__/types/patches.test-d.ts
git commit -m "$(printf 'feat(patches): add rewrite/merge directives and local.localPatchesDir\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

### Task 6: Build-time patch resolution

**Files:**

- Create: `package/src/patches/build.ts`
- Test: `package/__test__/patches/build.test.ts`

**Interfaces:**

- Consumes: `discoverPatches` (Task 4), `PluginConfig` (Task 5).
- Produces:
  - `isRewriteDirective(v: unknown): boolean`
  - `readLocalPatchesDir(config: PluginConfig): string | undefined`
  - `withResolvedBuildPatches(config: PluginConfig, baseDir: string): PluginConfig` — returns a config whose `patchedDependencies` is the discovered **distributed** map when the field is the rewrite directive or absent-with-patches; passes an explicit map/wrapped value through untouched.

- [ ] **Step 1: Write the failing test**

```typescript
// package/__test__/patches/build.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginConfig } from "../../src/define-plugin.js";
import { isRewriteDirective, readLocalPatchesDir, withResolvedBuildPatches } from "../../src/patches/build.js";

let base: string;
beforeEach(() => {
 base = mkdtempSync(join(tmpdir(), "rpc-build-"));
});
afterEach(() => {
 rmSync(base, { recursive: true, force: true });
});
function touch(rel: string): void {
 const abs = join(base, rel);
 mkdirSync(join(abs, ".."), { recursive: true });
 writeFileSync(abs, "diff\n", "utf8");
}
const cfg = (extra: Partial<PluginConfig>): PluginConfig =>
 ({ name: "@example/savvy", catalogs: {}, ...extra }) as PluginConfig;

describe("isRewriteDirective", () => {
 it("matches only { strategy: 'rewrite' }", () => {
  expect(isRewriteDirective({ strategy: "rewrite" })).toBe(true);
  expect(isRewriteDirective({ strategy: "merge" })).toBe(false);
  expect(isRewriteDirective({ "a@1": "patches/a.patch" })).toBe(false);
  expect(isRewriteDirective(undefined)).toBe(false);
 });
});

describe("readLocalPatchesDir", () => {
 it("reads a string override from local", () => {
  expect(readLocalPatchesDir(cfg({ local: { localPatchesDir: "public/x" } }))).toBe("public/x");
 });
 it("returns undefined when absent", () => {
  expect(readLocalPatchesDir(cfg({}))).toBeUndefined();
 });
});

describe("withResolvedBuildPatches", () => {
 it("injects the distributed map when patchedDependencies is absent and patches exist", () => {
  touch("public/patches/is-odd@3.0.1.patch");
  const out = withResolvedBuildPatches(cfg({}), base);
  expect(out.patchedDependencies).toEqual({
   "is-odd@3.0.1": "node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch",
  });
 });

 it("resolves the explicit { strategy: 'rewrite' } directive the same way", () => {
  touch("public/patches/a.patch");
  const out = withResolvedBuildPatches(cfg({ patchedDependencies: { strategy: "rewrite" } }), base);
  expect(out.patchedDependencies).toEqual({ a: "node_modules/.pnpm-config/@example/savvy/patches/a.patch" });
 });

 it("excludes local-only patches from the distributed map", () => {
  touch("patches/local.patch");
  const out = withResolvedBuildPatches(cfg({}), base);
  expect(out.patchedDependencies).toBeUndefined();
 });

 it("passes an explicit map through untouched (no discovery)", () => {
  touch("public/patches/a.patch");
  const explicit = { "x@1": "patches/x.patch" };
  const out = withResolvedBuildPatches(cfg({ patchedDependencies: explicit }), base);
  expect(out.patchedDependencies).toBe(explicit);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/patches/build.test.ts`
Expected: FAIL — cannot resolve `../../src/patches/build.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// package/src/patches/build.ts
import type { PluginConfig } from "../define-plugin.js";
import { discoverPatches } from "./discover.js";

/** True only for the `{ strategy: "rewrite" }` directive. @internal */
export function isRewriteDirective(v: unknown): boolean {
 return (
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).length === 1 &&
  (v as { strategy?: unknown }).strategy === "rewrite"
 );
}

/** Read `local.localPatchesDir` when it is a string. @internal */
export function readLocalPatchesDir(config: PluginConfig): string | undefined {
 const local = config.local as { localPatchesDir?: unknown } | undefined;
 return typeof local?.localPatchesDir === "string" ? local.localPatchesDir : undefined;
}

/**
 * Resolve build-time `patchedDependencies`. When the field is absent or the
 * `{ strategy: "rewrite" }` directive, run discovery and inject the distributed
 * map (`name`-scoped `.pnpm-config` paths) so `freeze` sees a plain map. An
 * explicit map / wrapped value passes through untouched.
 *
 * @internal
 */
export function withResolvedBuildPatches(config: PluginConfig, baseDir: string): PluginConfig {
 const raw = config.patchedDependencies;
 if (raw !== undefined && !isRewriteDirective(raw)) return config;

 const localPatchesDir = readLocalPatchesDir(config);
 const distributed = discoverPatches({
  baseDir,
  name: config.name,
  ...(localPatchesDir !== undefined ? { localPatchesDir } : {}),
 }).filter((p) => p.distributed);

 if (distributed.length === 0) {
  if (raw === undefined) return config;
  const { patchedDependencies: _drop, ...rest } = config;
  return rest as PluginConfig;
 }
 const map: Record<string, string> = {};
 for (const p of distributed) map[p.key] = p.distributedPath as string;
 return { ...config, patchedDependencies: map };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/patches/build.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/patches/build.ts package/__test__/patches/build.test.ts
git commit -m "$(printf 'feat(patches): resolve build-time patchedDependencies via discovery+rewrite\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

### Task 7: Wire build resolution into the plugin

**Files:**

- Modify: `package/src/plugin/index.ts:35-37`
- Test: `package/__test__/plugin/patches-build.int.test.ts`

**Interfaces:**

- Consumes: `withResolvedBuildPatches` (Task 6).
- The plugin's `getFrozen` freezes `withResolvedBuildPatches(config, process.cwd())` instead of the raw config, so the emitted pnpmfile's `base.patchedDependencies` carries distributed paths.

- [ ] **Step 1: Write the failing integration test**

```typescript
// package/__test__/plugin/patches-build.int.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "rolldown";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PnpmConfigPlugin } from "../../src/plugin/index.js";

let base: string;
let cwd: string;
beforeEach(() => {
 base = mkdtempSync(join(tmpdir(), "rpc-plugin-"));
 mkdirSync(join(base, "public", "patches"), { recursive: true });
 writeFileSync(join(base, "public", "patches", "is-odd@3.0.1.patch"), "diff\n", "utf8");
 cwd = process.cwd();
 process.chdir(base);
});
afterEach(() => {
 process.chdir(cwd);
 rmSync(base, { recursive: true, force: true });
});

async function loadPnpmfile(plugin: Plugin): Promise<string> {
 const id = "rolldown-pnpm-config/virtual/pnpmfile";
 const resolved = (plugin.resolveId as (s: string) => string | null)(id);
 const load = plugin.load as (id: string) => Promise<string | null>;
 const out = await load(resolved as string);
 return out as string;
}

describe("PnpmConfigPlugin patch discovery", () => {
 it("bakes the distributed patch path into base.patchedDependencies", async () => {
  const plugin = PnpmConfigPlugin({ name: "@example/savvy", catalogs: {} });
  const src = await loadPnpmfile(plugin);
  expect(src).toContain('"patchedDependencies":{"is-odd@3.0.1":"node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch"}');
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/plugin/patches-build.int.test.ts`
Expected: FAIL — `base.patchedDependencies` absent from emitted source (plugin freezes the raw config).

- [ ] **Step 3: Wire in the resolution**

In `package/src/plugin/index.ts`, add the import near the other imports:

```typescript
import { withResolvedBuildPatches } from "../patches/build.js";
```

Change `getFrozen` (line 37) from:

```typescript
 const getFrozen = (): Promise<Frozen> => (frozen ??= Effect.runPromise(deps.freeze(config)));
```

to:

```typescript
 const getFrozen = (): Promise<Frozen> =>
  (frozen ??= Effect.runPromise(deps.freeze(withResolvedBuildPatches(config, process.cwd()))));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run package/__test__/plugin/`
Expected: PASS — the new int test passes and existing `plugin/` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add package/src/plugin/index.ts package/__test__/plugin/patches-build.int.test.ts
git commit -m "$(printf 'feat(patches): discover and bake distributed patch paths at build\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

### Task 8: Export merge — local paths, preserving siblings

**Files:**

- Modify: `package/src/cli/local-merge.ts` (widen `combine`/`applyLocalDirective` strategy to tolerate `"merge"`/`"rewrite"`)
- Modify: `package/src/cli/commands/export.ts` (`runExport`: pre-resolve before `freeze`; override `effective.patchedDependencies` with local-merged map)
- Test: `package/__test__/cli/patches-export.int.test.ts`, `package/__test__/cli/local-merge-strategy.test.ts`

**Interfaces:**

- Consumes: `withResolvedBuildPatches`, `readLocalPatchesDir` (Task 6); `discoverPatches` (Task 4).
- `runExport` writes, for every owned patch, a **local** root-relative path into `patchedDependencies`, merged over the parsed file's existing entries (siblings preserved).

- [ ] **Step 1: Write the failing tests**

```typescript
// package/__test__/cli/local-merge-strategy.test.ts
import { describe, expect, it } from "vitest";
import { applyLocalDirective } from "../../src/cli/local-merge.js";

describe("applyLocalDirective strategy widening", () => {
 it("treats 'merge' as a key-wise union", () => {
  expect(applyLocalDirective({ a: "1" }, { value: { b: "2" }, strategy: "merge" }, {}, "x")).toEqual({ a: "1", b: "2" });
 });
 it("passes through on 'rewrite' (handled elsewhere)", () => {
  expect(applyLocalDirective({ a: "1" }, { strategy: "rewrite" }, {}, "x")).toEqual({ a: "1" });
 });
});
```

```typescript
// package/__test__/cli/patches-export.int.test.ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExport } from "../../src/cli/commands/export.js";

let root: string;
beforeEach(() => {
 root = mkdtempSync(join(tmpdir(), "rpc-export-"));
 // a config in examples/savvy with one distributed patch
 mkdirSync(join(root, "examples", "savvy", "public", "patches"), { recursive: true });
 writeFileSync(join(root, "examples", "savvy", "public", "patches", "is-odd@3.0.1.patch"), "diff\n", "utf8");
 writeFileSync(
  join(root, "examples", "savvy", "savvy.build.ts"),
  'import { PnpmConfigPlugin } from "rolldown-pnpm-config";\nPnpmConfigPlugin({ name: "@example/savvy", catalogs: {} });\n',
  "utf8",
 );
 // a root workspace file that already carries a foreign + repo-own patch entry
 writeFileSync(
  join(root, "pnpm-workspace.yaml"),
  'patchedDependencies:\n  foo@2.0.0: examples/rolldown/public/patches/foo@2.0.0.patch\n  bar@1.0.0: patches/bar@1.0.0.patch\n',
  "utf8",
 );
});
afterEach(() => {
 rmSync(root, { recursive: true, force: true });
});

describe("runExport patch merge", () => {
 it("writes the owned patch with a local path and preserves siblings", async () => {
  const result = await Effect.runPromise(
   runExport({
    configFile: join(root, "examples", "savvy", "savvy.build.ts"),
    workspacePath: join(root, "pnpm-workspace.yaml"),
    preview: false,
   }),
  );
  const yaml = readFileSync(result.path, "utf8");
  expect(yaml).toContain("is-odd@3.0.1: examples/savvy/public/patches/is-odd@3.0.1.patch");
  expect(yaml).toContain("foo@2.0.0: examples/rolldown/public/patches/foo@2.0.0.patch");
  expect(yaml).toContain("bar@1.0.0: patches/bar@1.0.0.patch");
  // the distributed .pnpm-config path must NOT leak into the local workspace file
  expect(yaml).not.toContain(".pnpm-config");
 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run package/__test__/cli/local-merge-strategy.test.ts package/__test__/cli/patches-export.int.test.ts`
Expected: FAIL — `applyLocalDirective` mishandles `"merge"`/`"rewrite"`; export emits the distributed path / drops siblings.

- [ ] **Step 3a: Widen `combine`/`applyLocalDirective`**

In `package/src/cli/local-merge.ts`, change the `combine` signature and the directive cast to accept the wider union, mapping `"merge"`→`"union"` and treating `"rewrite"` as passthrough. Replace the `combine` signature line:

```typescript
function combine(managed: unknown, value: unknown, strategy: "union" | "difference"): unknown {
```

(no change to `combine`'s body). Then in `applyLocalDirective`, replace the directive cast and the base-value block (lines 49-61) with:

```typescript
 const directive = isLocalDirective(raw)
  ? (raw as { preserve?: readonly string[]; value?: unknown; strategy?: "union" | "difference" | "merge" | "rewrite" })
  : { value: raw };

 // 1. base value: overwrite / union / difference / merge / rewrite-passthrough
 let result: unknown;
 const strat = directive.strategy === "merge" ? "union" : directive.strategy;
 if (strat && strat !== "rewrite" && directive.value !== undefined) {
  result = combine(managed, directive.value, strat);
 } else if (directive.value !== undefined && directive.strategy !== "rewrite") {
  result = directive.value; // overwrite
 } else {
  result = managed; // passthrough (rewrite, or default preserve only)
 }
```

- [ ] **Step 3b: Override `effective.patchedDependencies` in `runExport`**

In `package/src/cli/commands/export.ts`, add to the `node:path` import: `relative`. Add imports:

```typescript
import { discoverPatches } from "../../patches/discover.js";
import { readLocalPatchesDir, withResolvedBuildPatches } from "../../patches/build.js";
```

Change the `freeze` call (step 3 of `runExport`) to pre-resolve so `freeze` never sees the `{ strategy: "rewrite" }` directive:

```typescript
  const resolvedConfig = withResolvedBuildPatches(
   config as unknown as Parameters<typeof withResolvedBuildPatches>[0],
   dirname(opts.configFile),
  );
  const { base, manifest } = yield* freeze(resolvedConfig as unknown as Parameters<typeof freeze>[0]).pipe(
   Effect.mapError((e) => new ExportError({ message: e.message })),
  );
```

Immediately after `const effective = effectiveManaged(managed, localCfg, parsed, manifest, rootName);` (step 9), insert:

```typescript
  // patchedDependencies is special-cased: write LOCAL on-disk paths for every
  // owned patch, merged over existing entries so sibling plugins' and the
  // repo's own patch registrations survive (the distributed .pnpm-config
  // paths in `base` are for consumers, not this repo).
  const localPatchesDir = readLocalPatchesDir(config as unknown as Parameters<typeof readLocalPatchesDir>[0]);
  const owned = discoverPatches({
   baseDir: dirname(opts.configFile),
   name: typeof config.name === "string" ? config.name : "",
   ...(localPatchesDir !== undefined ? { localPatchesDir } : {}),
  });
  if (owned.length > 0) {
   const workspaceRoot = dirname(path);
   const existing =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
     ? ((parsed as Record<string, unknown>).patchedDependencies as Record<string, string> | undefined)
     : undefined;
   const mergedPatches: Record<string, string> = { ...(existing ?? {}) };
   for (const p of owned) mergedPatches[p.key] = relative(workspaceRoot, p.absPath).split(/[\\/]/).join("/");
   effective.patchedDependencies = mergedPatches;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run package/__test__/cli/local-merge-strategy.test.ts package/__test__/cli/patches-export.int.test.ts package/__test__/cli/`
Expected: PASS — new tests pass; existing `cli/` export tests still pass.

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/local-merge.ts package/src/cli/commands/export.ts package/__test__/cli/local-merge-strategy.test.ts package/__test__/cli/patches-export.int.test.ts
git commit -m "$(printf 'feat(patches): merge local patch paths into pnpm-workspace.yaml on export\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

### Task 9: Guided reconcile reporting

**Files:**

- Create: `package/src/patches/reconcile.ts`
- Modify: `package/src/cli/commands/export.ts` (compute report in `runExport`, add to return; print in `exportCommand`)
- Test: `package/__test__/patches/reconcile.test.ts`

**Interfaces:**

- Consumes: `patchKeyFromFileName` (Task 2), `DiscoveredPatch` (Task 4).
- Produces:

```typescript
export interface PatchReconcileReport {
 readonly staleEntries: readonly string[];   // registered key whose file is missing on disk
 readonly keyMismatches: readonly string[];  // registered key ≠ key derived from its filename
}
export function reconcilePatches(args: {
 parsedPatched: Record<string, string>;
 root: string;
 exists: (absPath: string) => boolean;
}): PatchReconcileReport;
```

- [ ] **Step 1: Write the failing test**

```typescript
// package/__test__/patches/reconcile.test.ts
import { describe, expect, it } from "vitest";
import { reconcilePatches } from "../../src/patches/reconcile.js";

describe("reconcilePatches", () => {
 it("flags entries whose patch file is missing on disk", () => {
  const report = reconcilePatches({
   parsedPatched: { "a@1": "patches/a@1.patch", "b@2": "patches/b@2.patch" },
   root: "/repo",
   exists: (p) => p === "/repo/patches/a@1.patch",
  });
  expect(report.staleEntries).toEqual(["b@2"]);
 });
 it("flags a key that does not match its filename", () => {
  const report = reconcilePatches({
   parsedPatched: { "react@18": "patches/wrong.patch" },
   root: "/repo",
   exists: () => true,
  });
  expect(report.keyMismatches).toEqual(["react@18"]);
 });
 it("is silent for a consistent, present entry", () => {
  const report = reconcilePatches({
   parsedPatched: { "is-odd@3.0.1": "patches/is-odd@3.0.1.patch" },
   root: "/repo",
   exists: () => true,
  });
  expect(report).toEqual({ staleEntries: [], keyMismatches: [] });
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/patches/reconcile.test.ts`
Expected: FAIL — cannot resolve `../../src/patches/reconcile.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// package/src/patches/reconcile.ts
import { basename, join } from "node:path";
import { patchKeyFromFileName } from "./keys.js";

/** Informational reconcile of registered patches against on-disk reality. @internal */
export interface PatchReconcileReport {
 readonly staleEntries: readonly string[];
 readonly keyMismatches: readonly string[];
}

/**
 * Report `patchedDependencies` entries whose file is missing (`staleEntries`) or
 * whose key does not derive from its filename (`keyMismatches`). `exists` is
 * injected so the function stays pure and testable.
 *
 * @internal
 */
export function reconcilePatches(args: {
 parsedPatched: Record<string, string>;
 root: string;
 exists: (absPath: string) => boolean;
}): PatchReconcileReport {
 const staleEntries: string[] = [];
 const keyMismatches: string[] = [];
 for (const [key, rel] of Object.entries(args.parsedPatched)) {
  if (!args.exists(join(args.root, rel))) staleEntries.push(key);
  const derived = patchKeyFromFileName(basename(rel));
  if (derived !== null && derived !== key) keyMismatches.push(key);
 }
 return { staleEntries, keyMismatches };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/patches/reconcile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the report into export output**

In `package/src/cli/commands/export.ts`, add the imports:

```typescript
import { existsSync } from "node:fs";
import { reconcilePatches } from "../../patches/reconcile.js";
import type { PatchReconcileReport } from "../../patches/reconcile.js";
```

In `runExport`, after the patch-merge block from Task 8, compute the report:

```typescript
  const report: PatchReconcileReport = reconcilePatches({
   parsedPatched: (effective.patchedDependencies as Record<string, string> | undefined) ?? {},
   root: dirname(path),
   exists: existsSync,
  });
```

Add `report` to both `return` objects in `runExport` (the preview return and the write return), e.g. `return { path, rendered, written: false, diff, report };`, and add `report: PatchReconcileReport` to `runExport`'s declared return type.

In `exportCommand`'s handler, after the existing `process.stdout.write` block, print warnings:

```typescript
    for (const k of result.report.staleEntries)
     process.stderr.write(`warning: patch entry "${k}" has no file on disk\n`);
    for (const k of result.report.keyMismatches)
     process.stderr.write(`warning: patch entry "${k}" does not match its filename\n`);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run package/__test__/patches/ package/__test__/cli/ && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package/src/patches/reconcile.ts package/src/cli/commands/export.ts package/__test__/patches/reconcile.test.ts
git commit -m "$(printf 'feat(patches): report stale and mismatched patch entries on export\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

### Task 10: Two-plugin coexistence integration test

**Files:**

- Test: `package/__test__/patches/coexistence.int.test.ts`

**Interfaces:**

- Consumes: `withResolvedBuildPatches` (Task 6), `discoverPatches` (Task 4) — proves the spec's multi-plugin scenario end to end without a full bundler build.

- [ ] **Step 1: Write the integration test**

```typescript
// package/__test__/patches/coexistence.int.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginConfig } from "../../src/define-plugin.js";
import { withResolvedBuildPatches } from "../../src/patches/build.js";
import { discoverPatches } from "../../src/patches/discover.js";

let root: string;
beforeEach(() => {
 root = mkdtempSync(join(tmpdir(), "rpc-coexist-"));
 const mk = (rel: string): void => {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, "diff\n", "utf8");
 };
 mk("examples/savvy/public/patches/is-odd@3.0.1.patch");
 mk("examples/savvy/patches/react.patch");
 mk("examples/rolldown/public/patches/foo@2.0.0.patch");
 mk("patches/bar@1.0.0.patch");
});
afterEach(() => {
 rmSync(root, { recursive: true, force: true });
});
const cfg = (name: string): PluginConfig => ({ name, catalogs: {} }) as PluginConfig;

describe("two plugins + a repo-own patch", () => {
 it("each plugin bakes only its own distributed patch under its own .pnpm-config prefix", () => {
  const savvy = withResolvedBuildPatches(cfg("@example/savvy"), join(root, "examples", "savvy"));
  const rolldown = withResolvedBuildPatches(cfg("@example/rolldown"), join(root, "examples", "rolldown"));

  expect(savvy.patchedDependencies).toEqual({
   "is-odd@3.0.1": "node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch",
  });
  expect(rolldown.patchedDependencies).toEqual({
   "foo@2.0.0": "node_modules/.pnpm-config/@example/rolldown/patches/foo@2.0.0.patch",
  });
 });

 it("local export paths for savvy include its local-only patch and exclude foreign ones", () => {
  const owned = discoverPatches({ baseDir: join(root, "examples", "savvy"), name: "@example/savvy" });
  const local = Object.fromEntries(owned.map((p) => [p.key, relative(root, p.absPath).split(/[\\/]/).join("/")]));
  expect(local).toEqual({
   "is-odd@3.0.1": "examples/savvy/public/patches/is-odd@3.0.1.patch",
   react: "examples/savvy/patches/react.patch",
  });
  // rolldown's and the repo-own patch are NOT owned by savvy
  expect(Object.keys(local)).not.toContain("foo@2.0.0");
  expect(Object.keys(local)).not.toContain("bar@1.0.0");
 });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/patches/coexistence.int.test.ts`
Expected: PASS (2 tests) — all earlier tasks already provide the implementation.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `pnpm run typecheck && pnpm vitest run package/__test__/patches/ package/__test__/plugin/ package/__test__/cli/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package/__test__/patches/coexistence.int.test.ts
git commit -m "$(printf 'test(patches): prove two plugins and a repo-own patch coexist\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

### Task 11: Documentation

**Files:**

- Create/update: a user-facing "Distributing dependency patches" guide (delegate to the `design-docs:user-docs` agent).
- Update: `.claude/design/rolldown-pnpm-config/export-cli.md` and `.claude/design/rolldown-pnpm-config/architecture.md` (delegate to the `design-docs:design-doc-agent`).
- Update: `.claude/design/rolldown-pnpm-config/settings-coverage.md` note that `patchedDependencies` now also supports discovery+rewrite (delegate to design-doc-agent).

**Interfaces:** none (docs only).

- [ ] **Step 1: Delegate the design-doc updates**

Dispatch the `design-docs:design-doc-agent` to: (a) add a "Patch distribution" section to `export-cli.md` describing the `patches/` vs `public/patches/` convention, the `rewrite`/`merge` directives, `local.localPatchesDir`, and the merge-by-key export behavior; (b) add a one-paragraph roadmap/current-state note to `architecture.md` referencing the spec `2026-06-30-patch-distribution-design.md`; (c) note in `settings-coverage.md` that `patchedDependencies` gains discovery+rewrite while the descriptor itself is unchanged.

- [ ] **Step 2: Delegate the user-facing guide**

Dispatch the `design-docs:user-docs` agent to write a "Distributing dependency patches" how-to: the `pnpm patch` → `patch-commit --patches-dir public/patches` → build → `export` round-trip, the local-vs-distributed path explanation, the multi-plugin/repo-own coexistence rules, and the pnpm 10.4+ / `node_modules/.pnpm-config/<name>/` requirement.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec markdownlint-cli2 --config lib/configs/.markdownlint-cli2.jsonc` (expected: clean), then:

```bash
git add .claude/design/rolldown-pnpm-config/ docs/
git commit -m "$(printf 'docs(patches): document patch distribution workflow\n\nSigned-off-by: C. Spencer Beggs <spencer@beggs.codes>')"
```

---

## Self-Review

**Spec coverage:**

- Ownership model (`patches/` local-only + `public/patches/` distributed, scoped by `name`) → Tasks 4, 6, 10.
- `patchesDir` never read → confirmed: no task reads it; discovery uses fixed convention roots + `localPatchesDir`.
- Path rewrite independent of `patchesDir` → Task 3.
- Authoring surface (`{ strategy: "rewrite" }`, `local.patchedDependencies: { strategy: "merge" }`, `local.localPatchesDir`, discovery-on-by-default) → Tasks 5, 6, 8.
- Build bakes distributed `base`; export writes local merged → Tasks 7, 8.
- `mapChildWins` reconciliation → relies on existing descriptor (unchanged), verified by Task 8's "no `.pnpm-config` in local file" assertion.
- Guided reconcile (orphans/mismatches) → Task 9.
- No collision warnings; no file copying; no `pnpm patch` wrapper; no distributed `patchesDir` → honored (no task implements them).
- Error handling: missing explicit file → existing pnpm `PATCH_FILE_NOT_FOUND` at install (not re-implemented); bad filename → `patchKeyFromFileName` returns `null` and the file is skipped (Task 2/4). Note: the spec mentioned a build-time `ConfigError` for an unparseable explicit declaration; this plan skips silently instead (simpler, and pnpm surfaces unused/missing patches itself) — acceptable narrowing.
- Scoped-name path verification → Task 1.
- Testing matrix (discovery table, key round-trip, merge-preserves-siblings, `localPatchesDir`, two-plugin e2e) → Tasks 2, 4, 8, 10.

**Placeholder scan:** none — every code step shows full code; every run step shows the command and expected result.

**Type consistency:** `discoverPatches`/`DiscoveredPatch`/`DiscoverPatchesOptions` (Task 4) are consumed unchanged in Tasks 6, 8, 10. `withResolvedBuildPatches(config, baseDir)` and `readLocalPatchesDir(config)` (Task 6) are consumed unchanged in Tasks 7, 8. `distributedPatchPath`/`distributedRel` (Task 3) consumed only in Task 4. `patchKeyFromFileName` (Task 2) consumed in Tasks 4, 9. `PatchReconcileReport` (Task 9) consistent across its definition and the export return type.

**One deliberate narrowing vs. spec:** an unparseable *explicit* patch declaration is skipped rather than raising a build-time `ConfigError`. If strictness is wanted, add a guard in `withResolvedBuildPatches` and a test in Task 6 — flagged here so the reviewer can decide.
