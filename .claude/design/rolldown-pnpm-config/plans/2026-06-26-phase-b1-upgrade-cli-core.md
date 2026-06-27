# Phase B1 — Upgrade CLI Core (non-interactive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working `rolldown-pnpm-config upgrade --yes <file>` that statically finds the catalog version literals in a config, resolves the latest in-range version per package from the registry, rewrites those literals (and any strategy-driven `peer` literal) in place, and writes the file — all non-interactively.

**Architecture:** Pure, independently-testable units (`discover` parses the source to catalog entries with byte-offset spans via oxc; `plan` computes candidate versions with semver-effect; `peer-range` recomputes a peer range from a strategy; `rewrite` applies span edits right-to-left) plus one Effect service (`RegistryResolver`, backed by `pnpm view`). A thin `@effect/cli` `upgrade` command wires them together and `bin.ts` is the executable entry. The interactive Ink walk, drift detection, and dry-run diff are Phase B2.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, `@effect/cli`, `@effect/platform`, `@effect/platform-node`, `oxc-parser`, `semver-effect`, Vitest (forks pool), Biome.

## Global Constraints

- Relative imports MUST use `.js` extensions; Node built-ins MUST use `node:` protocol; type-only imports MUST use `import type`.
- No import cycles (Biome `noImportCycles` is an error).
- All tests live in `package/__test__/`, never in `src/`. CLI tests live under `package/__test__/cli/`. Static fixtures (sample config sources) go in `package/__test__/cli/fixtures/`; shared helpers in `package/__test__/cli/utils/`.
- The single CLI command in B1 is `upgrade` (alias `up`). Only the non-interactive path (`-y`/`--yes`, latest-in-range) is built here. Major bumps are NOT applied non-interactively.
- Operator preservation: only the version digits inside a range literal change; the leading `^`/`~`/exact operator is reused. Multi-comparator ranges (e.g. `>=5 <6`) are reported skipped, not rewritten.
- The runtime engine (`package/src/catalogs.ts`, `freeze.ts`, `strategies/`, descriptors) is NOT modified by this plan. CLI code lives only under `package/src/cli/`.
- Coverage: the CLI shell (`bin.ts`, the Live resolver's `pnpm`-shelling call, the `@effect/cli` command wiring) is not unit-coverable. Per project decision, the fix is to LOWER the coverage thresholds in `vitest.config.ts` (Task 6 Step 6), not to add per-file excludes. The pure units (`discover`, `plan`, `rewrite`, `peer-range`) remain fully tested.
- New dependencies are added to `package/package.json` `dependencies` using the same catalog protocol the repo uses (`catalog:silk`) when that catalog defines them; otherwise a concrete range. Verify against `pnpm-workspace.yaml` catalogs before choosing.
- Commits require conventional-commit format + DCO signoff: `Signed-off-by: C. Spencer Beggs <spencer@beg.gs>`. Commit bodies must NOT contain markdown inline code (backticks) — the `silk/body-no-markdown` commitlint rule rejects them.
- Run a single test file with: `pnpm vitest run <path>`.

## Shared types (created in Task 1, referenced throughout)

```ts
// package/src/cli/types.ts
import type { PeerStrategy } from "../catalogs.js";

/** A version literal discovered in a config, with its byte-offset span. */
export interface CatalogEntry {
 readonly catalog: string;
 readonly pkg: string;
 readonly currentRange: string;
 readonly operator: "^" | "~" | "";
 /** Byte offsets [start, end) of the range string literal, including quotes. */
 readonly rangeSpan: readonly [number, number];
 /** Present when the package declares a materialized peer literal. */
 readonly peer?: { readonly value: string; readonly span: readonly [number, number] };
 readonly strategy?: PeerStrategy;
}

/** A version choice computed for a CatalogEntry. */
export interface Candidate {
 readonly kind: "in-range" | "latest" | "keep";
 /** Operator-preserved range, e.g. "^5.9.3". */
 readonly range: string;
 /** Bare version, e.g. "5.9.3". */
 readonly version: string;
 /** True when this crosses the current major. */
 readonly isMajor: boolean;
 /** Recomputed peer range when the entry carries a strategy; absent otherwise. */
 readonly peerRange?: string;
}

/** A single span replacement. */
export interface Edit {
 readonly span: readonly [number, number];
 readonly text: string;
}
```

---

### Task 1: Add dependencies + shared types + `derivePeerRange`

**Files:**

- Modify: `package/package.json` (add dependencies)
- Create: `package/src/cli/types.ts`
- Create: `package/src/cli/peer-range.ts`
- Test: `package/__test__/cli/peer-range.test.ts`

**Interfaces:**

- Produces:
  - `package/src/cli/types.ts` exporting `CatalogEntry`, `Candidate`, `Edit` (see Shared types above).
  - `class PeerRangeError extends Data.TaggedError("PeerRangeError")<{ readonly message: string }>`
  - `function derivePeerRange(range: string, strategy: PeerStrategy): Effect.Effect<string, PeerRangeError>` — `"lock"` → `${operator}${major}.${minor}.${patch}`; `"lock-minor"` → `${operator}${major}.${minor}.0`.

- [ ] **Step 1: Add the dependencies**

First inspect available catalog versions:

```bash
grep -nE "@effect/cli|@effect/platform|oxc-parser|semver-effect" pnpm-workspace.yaml
```

Add to `package/package.json` `dependencies` (use `catalog:silk` for any that the silk catalog defines; otherwise the latest stable range shown by `pnpm view <pkg> version`):

```jsonc
"@effect/cli": "catalog:silk",
"@effect/platform": "catalog:silk",
"@effect/platform-node": "catalog:silk",
"oxc-parser": "<latest stable, e.g. ^0.50.0>",
"semver-effect": "<latest stable, e.g. ^1.0.0>"
```

Then install:

```bash
pnpm install
```

Verify they resolve:

```bash
ls node_modules/@effect/cli node_modules/oxc-parser node_modules/semver-effect
```

- [ ] **Step 2: Create the shared types**

Create `package/src/cli/types.ts` with exactly the content from the "Shared types" section above.

- [ ] **Step 3: Write the failing test**

Create `package/__test__/cli/peer-range.test.ts`:

```ts
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { derivePeerRange } from "../../src/cli/peer-range.js";

const run = (range: string, strategy: "lock" | "lock-minor") => Effect.runPromise(derivePeerRange(range, strategy));

describe("derivePeerRange", () => {
 it("lock pins to the exact version, keeping the operator", async () => {
  await expect(run("^6.5.1", "lock")).resolves.toBe("^6.5.1");
  await expect(run("~6.5.1", "lock")).resolves.toBe("~6.5.1");
  await expect(run("6.5.1", "lock")).resolves.toBe("6.5.1");
 });

 it("lock-minor floors the patch to .0, keeping the operator", async () => {
  await expect(run("^6.5.1", "lock-minor")).resolves.toBe("^6.5.0");
  await expect(run("~4.2.9", "lock-minor")).resolves.toBe("~4.2.0");
 });

 it("fails on a range it cannot parse", async () => {
  await expect(run(">=5 <6", "lock")).rejects.toThrow();
 });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/peer-range.test.ts`
Expected: FAIL — cannot find module `../../src/cli/peer-range.js`.

- [ ] **Step 5: Implement `peer-range.ts`**

Create `package/src/cli/peer-range.ts`:

```ts
import { Data, Effect } from "effect";
import { SemVer } from "semver-effect";
import type { PeerStrategy } from "../catalogs.js";

/**
 * Typed failure raised when a peer range cannot be derived from a range string.
 *
 * @internal
 */
export class PeerRangeError extends Data.TaggedError("PeerRangeError")<{ readonly message: string }> {}

/** Splits a simple range into its operator prefix and version (e.g. `^6.5.1`). */
const PREFIX_RE = /^(\^|~|)(\d.*)$/;

/**
 * Recompute a materialized peer range from a package range and a strategy.
 * `"lock"` pins to the exact version; `"lock-minor"` floors the patch to `.0`.
 * The operator (`^`/`~`/exact) is preserved.
 *
 * @internal
 */
export function derivePeerRange(range: string, strategy: PeerStrategy): Effect.Effect<string, PeerRangeError> {
 return Effect.gen(function* () {
  const match = PREFIX_RE.exec(range);
  if (!match) {
   return yield* Effect.fail(new PeerRangeError({ message: `Cannot derive peer range from "${range}"` }));
  }
  const [, prefix, version] = match;
  const parsed = yield* SemVer.parse(version).pipe(
   Effect.mapError(() => new PeerRangeError({ message: `Invalid version in range "${range}"` })),
  );
  return strategy === "lock"
   ? `${prefix}${parsed.major}.${parsed.minor}.${parsed.patch}`
   : `${prefix}${parsed.major}.${parsed.minor}.0`;
 });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/peer-range.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add package/package.json pnpm-lock.yaml package/src/cli/types.ts package/src/cli/peer-range.ts package/__test__/cli/peer-range.test.ts
git commit -m "feat: add CLI deps, shared types, and peer-range helper

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 2: `discover.ts` — parse config to CatalogEntry[]

**Files:**

- Create: `package/src/cli/discover.ts`
- Test: `package/__test__/cli/discover.test.ts`
- Create fixture: `package/__test__/cli/fixtures/sample-config.ts.txt`

**Interfaces:**

- Consumes: `CatalogEntry` (Task 1).
- Produces:
  - `class DiscoverError extends Data.TaggedError("DiscoverError")<{ readonly message: string }>`
  - `function discoverCatalogEntries(source: string, filename: string): { entries: CatalogEntry[]; skipped: string[] }` — finds the single `PnpmConfigPlugin(...)` call, walks `.catalogs.<name>.packages`, returns one entry per literal-range package. Non-literal/complex-range packages are reported in `skipped` (by `<catalog>.<pkg>`), never thrown.

- [ ] **Step 1: Create the fixture**

Create `package/__test__/cli/fixtures/sample-config.ts.txt` (a `.txt` so it is not type-checked/discovered as code):

```ts
import { PnpmConfigPlugin } from "rolldown-pnpm-config";

export const plugin = PnpmConfigPlugin({
 catalogs: {
  silk: {
   packages: {
    typescript: "^5.9.0",
    vitest: { range: "^4.0.0", peer: "^4.0.0", strategy: "lock-minor" },
    effect: { range: ">=3 <4" },
   },
  },
 },
 strictDepBuilds: true,
});
```

- [ ] **Step 2: Write the failing test**

Create `package/__test__/cli/discover.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { discoverCatalogEntries } from "../../src/cli/discover.js";

const source = readFileSync(fileURLToPath(new URL("./fixtures/sample-config.ts.txt", import.meta.url)), "utf8");

describe("discoverCatalogEntries", () => {
 it("finds bare and object-form range literals with spans", () => {
  const { entries } = discoverCatalogEntries(source, "sample-config.ts");
  const ts = entries.find((e) => e.pkg === "typescript");
  expect(ts).toMatchObject({ catalog: "silk", currentRange: "^5.9.0", operator: "^" });
  // span points at the quoted literal
  expect(source.slice(ts!.rangeSpan[0], ts!.rangeSpan[1])).toBe('"^5.9.0"');

  const vitest = entries.find((e) => e.pkg === "vitest");
  expect(vitest).toMatchObject({ currentRange: "^4.0.0", strategy: "lock-minor" });
  expect(vitest!.peer).toBeDefined();
  expect(source.slice(vitest!.peer!.span[0], vitest!.peer!.span[1])).toBe('"^4.0.0"');
 });

 it("skips packages whose range is not a simple-operator literal", () => {
  const { entries, skipped } = discoverCatalogEntries(source, "sample-config.ts");
  expect(entries.find((e) => e.pkg === "effect")).toBeUndefined();
  expect(skipped).toContain("silk.effect");
 });

 it("returns no entries when there is no PnpmConfigPlugin call", () => {
  const { entries } = discoverCatalogEntries("export const x = 1;", "x.ts");
  expect(entries).toEqual([]);
 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/discover.test.ts`
Expected: FAIL — cannot find module `../../src/cli/discover.js`.

- [ ] **Step 4: Implement `discover.ts`**

Create `package/src/cli/discover.ts`:

```ts
import { Data } from "effect";
import { parseSync } from "oxc-parser";
import type { CatalogEntry } from "./types.js";

/**
 * Typed failure raised when the config source cannot be parsed.
 *
 * @internal
 */
export class DiscoverError extends Data.TaggedError("DiscoverError")<{ readonly message: string }> {}

/** Matches a simple-operator range we can safely rewrite (`^x`, `~x`, or bare `x`). */
const SIMPLE_RANGE_RE = /^(\^|~|)(\d[\w.+-]*)$/;

// Minimal shapes for the oxc ESTree nodes we traverse. oxc nodes carry numeric
// `start`/`end` byte offsets.
type Node = { readonly type: string; readonly start: number; readonly end: number; readonly [k: string]: unknown };

function operatorOf(range: string): "^" | "~" | "" {
 if (range.startsWith("^")) return "^";
 if (range.startsWith("~")) return "~";
 return "";
}

/** Find a property by key name in an ObjectExpression node. */
function prop(obj: Node, key: string): Node | undefined {
 const properties = (obj.properties as Node[]) ?? [];
 for (const p of properties) {
  if (p.type !== "Property") continue;
  const k = p.key as Node;
  const name = k.type === "Identifier" ? (k.name as string) : k.type === "Literal" ? String(k.value) : undefined;
  if (name === key) return p.value as Node;
 }
 return undefined;
}

/** Find the first `PnpmConfigPlugin(...)` CallExpression's first argument object. */
function findPluginArg(program: Node): Node | undefined {
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

/**
 * Statically discover the catalog version literals in a config source. Locates
 * the single `PnpmConfigPlugin(...)` call and walks `.catalogs.<name>.packages`.
 * Each package whose range is a simple-operator string literal yields a
 * CatalogEntry with byte-offset spans; anything else (computed value, complex
 * range) is reported in `skipped` as `<catalog>.<pkg>` and never throws.
 *
 * @internal
 */
export function discoverCatalogEntries(
 source: string,
 filename: string,
): { entries: CatalogEntry[]; skipped: string[] } {
 const result = parseSync(filename, source);
 const program = result.program as unknown as Node;
 const entries: CatalogEntry[] = [];
 const skipped: string[] = [];

 const arg = findPluginArg(program);
 if (!arg) return { entries, skipped };

 const catalogs = prop(arg, "catalogs");
 if (!catalogs || catalogs.type !== "ObjectExpression") return { entries, skipped };

 for (const catProp of (catalogs.properties as Node[]) ?? []) {
  if (catProp.type !== "Property") continue;
  const catKey = catProp.key as Node;
  const catalog = catKey.type === "Identifier" ? (catKey.name as string) : String(catKey.value);
  const decl = catProp.value as Node;
  if (decl.type !== "ObjectExpression") continue;
  const packages = prop(decl, "packages");
  if (!packages || packages.type !== "ObjectExpression") continue;

  for (const pkgProp of (packages.properties as Node[]) ?? []) {
   if (pkgProp.type !== "Property") continue;
   const pkgKey = pkgProp.key as Node;
   const pkg = pkgKey.type === "Identifier" ? (pkgKey.name as string) : String(pkgKey.value);
   const value = pkgProp.value as Node;

   // Resolve the range literal node and any peer/strategy.
   let rangeNode: Node | undefined;
   let peerNode: Node | undefined;
   let strategy: "lock" | "lock-minor" | undefined;

   if (value.type === "Literal" && typeof value.value === "string") {
    rangeNode = value;
   } else if (value.type === "ObjectExpression") {
    const r = prop(value, "range");
    if (r?.type === "Literal" && typeof r.value === "string") rangeNode = r;
    const p = prop(value, "peer");
    if (p?.type === "Literal" && typeof p.value === "string") peerNode = p;
    const s = prop(value, "strategy");
    if (s?.type === "Literal" && (s.value === "lock" || s.value === "lock-minor")) strategy = s.value;
   }

   const currentRange = rangeNode ? (rangeNode.value as string) : undefined;
   if (!currentRange || !SIMPLE_RANGE_RE.test(currentRange)) {
    skipped.push(`${catalog}.${pkg}`);
    continue;
   }

   entries.push({
    catalog,
    pkg,
    currentRange,
    operator: operatorOf(currentRange),
    rangeSpan: [rangeNode!.start, rangeNode!.end],
    ...(peerNode ? { peer: { value: peerNode.value as string, span: [peerNode.start, peerNode.end] } } : {}),
    ...(strategy ? { strategy } : {}),
   });
  }
 }

 return { entries, skipped };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/discover.test.ts`
Expected: PASS (3 tests). If the oxc node shape differs (e.g. string literals are `StringLiteral` not `Literal`, or keys expose `name` differently), adjust the `type`/property checks to match what `parseSync` actually returns — verify by logging `result.program` for the fixture once, then delete the log.

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/discover.ts package/__test__/cli/discover.test.ts package/__test__/cli/fixtures/sample-config.ts.txt
git commit -m "feat: add static catalog discovery via oxc

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 3: `plan.ts` — compute candidates per entry

**Files:**

- Create: `package/src/cli/plan.ts`
- Test: `package/__test__/cli/plan.test.ts`

**Interfaces:**

- Consumes: `CatalogEntry`, `Candidate` (Task 1); `derivePeerRange` (Task 1).
- Produces:
  - `function planEntry(entry: CatalogEntry, versions: readonly string[]): Effect.Effect<Candidate[], PeerRangeError>` — returns candidates in order: in-range (if newer than current and satisfies current range), latest (if a stable version newer than in-range exists), keep. Prereleases excluded. Each candidate carries `peerRange` when the entry has a `strategy`. If no upgrade exists, returns just `keep`.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/cli/plan.test.ts`:

```ts
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { planEntry } from "../../src/cli/plan.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
 catalog: "silk",
 pkg: "typescript",
 currentRange: "^5.9.0",
 operator: "^",
 rangeSpan: [0, 8],
 ...over,
});

const run = (e: CatalogEntry, versions: string[]) => Effect.runPromise(planEntry(e, versions));

describe("planEntry", () => {
 it("offers latest in-range and latest overall, preserving the operator", async () => {
  const c = await run(entry(), ["5.9.0", "5.9.3", "5.9.5-beta.1", "6.0.0", "7.1.0"]);
  expect(c.map((x) => [x.kind, x.range])).toEqual([
   ["in-range", "^5.9.3"],
   ["latest", "^7.1.0"],
   ["keep", "^5.9.0"],
  ]);
  expect(c.find((x) => x.kind === "latest")!.isMajor).toBe(true);
 });

 it("returns only keep when already at the newest stable version", async () => {
  const c = await run(entry({ currentRange: "^7.1.0", rangeSpan: [0, 8] }), ["7.1.0"]);
  expect(c.map((x) => x.kind)).toEqual(["keep"]);
 });

 it("attaches a recomputed peerRange when the entry has a strategy", async () => {
  const c = await run(
   entry({ currentRange: "^4.0.0", strategy: "lock-minor", peer: { value: "^4.0.0", span: [0, 8] } }),
   ["4.0.0", "4.2.3"],
  );
  const inRange = c.find((x) => x.kind === "in-range")!;
  expect(inRange.range).toBe("^4.2.3");
  expect(inRange.peerRange).toBe("^4.2.0");
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/plan.test.ts`
Expected: FAIL — cannot find module `../../src/cli/plan.js`.

- [ ] **Step 3: Implement `plan.ts`**

Create `package/src/cli/plan.ts`:

```ts
import { Effect } from "effect";
import { Range, SemVer } from "semver-effect";
import { derivePeerRange, type PeerRangeError } from "./peer-range.js";
import type { Candidate, CatalogEntry } from "./types.js";

/** Parse a version, returning null instead of failing (filters junk tags). */
const parseOrNull = (v: string) =>
 SemVer.parse(v).pipe(Effect.catchAll(() => Effect.succeed(null)));

/**
 * Compute the candidate versions for one catalog entry against the list of
 * published versions. Order: latest in-range (when newer than current), latest
 * overall stable (when newer than the in-range pick), then keep. Prereleases
 * are excluded. When the entry carries a strategy, each non-keep candidate gets
 * a recomputed `peerRange`.
 *
 * @internal
 */
export function planEntry(
 entry: CatalogEntry,
 versions: readonly string[],
): Effect.Effect<Candidate[], PeerRangeError> {
 return Effect.gen(function* () {
  const range = yield* Range.parse(entry.currentRange).pipe(Effect.catchAll(() => Effect.succeed(null)));
  const parsed: SemVer.SemVer[] = [];
  for (const v of versions) {
   const sv = yield* parseOrNull(v);
   if (sv && sv.isStable) parsed.push(sv);
  }
  parsed.sort((a, b) => a.compare(b)); // ascending
  const max = (list: SemVer.SemVer[]) => (list.length ? list[list.length - 1] : null);

  const currentMajor = (yield* parseOrNull(entry.currentRange.replace(/^[\^~]/, "")))?.major ?? 0;
  const inRangeMax = range ? max(parsed.filter((v) => range.test(v))) : null;
  const overallMax = max(parsed);

  const withPeer = (version: string): Effect.Effect<string | undefined, PeerRangeError> =>
   entry.strategy ? derivePeerRange(`${entry.operator}${version}`, entry.strategy) : Effect.succeed(undefined);

  const candidates: Candidate[] = [];

  if (inRangeMax && inRangeMax.toString() !== entry.currentRange.replace(/^[\^~]/, "")) {
   const version = inRangeMax.toString();
   const peerRange = yield* withPeer(version);
   candidates.push({
    kind: "in-range",
    range: `${entry.operator}${version}`,
    version,
    isMajor: inRangeMax.major > currentMajor,
    ...(peerRange ? { peerRange } : {}),
   });
  }

  if (overallMax && (!inRangeMax || overallMax.gt(inRangeMax))) {
   const version = overallMax.toString();
   const peerRange = yield* withPeer(version);
   candidates.push({
    kind: "latest",
    range: `${entry.operator}${version}`,
    version,
    isMajor: overallMax.major > currentMajor,
    ...(peerRange ? { peerRange } : {}),
   });
  }

  candidates.push({
   kind: "keep",
   range: entry.currentRange,
   version: entry.currentRange.replace(/^[\^~]/, ""),
   isMajor: false,
  });

  return candidates;
 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/plan.test.ts`
Expected: PASS (3 tests). If `SemVer.SemVer` is not the correct type name or `Range.parse`/`range.test`/`v.compare`/`v.gt`/`v.isStable` differ from the installed `semver-effect` surface, adjust to the real API (check `node_modules/semver-effect` types) — the algorithm is unchanged.

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/plan.ts package/__test__/cli/plan.test.ts
git commit -m "feat: add candidate planning with semver-effect

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 4: `rewrite.ts` — apply span edits

**Files:**

- Create: `package/src/cli/rewrite.ts`
- Test: `package/__test__/cli/rewrite.test.ts`

**Interfaces:**

- Consumes: `Edit` (Task 1).
- Produces:
  - `function applyEdits(source: string, edits: readonly Edit[]): string` — applies edits sorted by descending start offset (right-to-left) so earlier spans stay valid. Throws `RangeError` if two edits overlap.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/cli/rewrite.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyEdits } from "../../src/cli/rewrite.js";

describe("applyEdits", () => {
 it("replaces multiple spans, applying right-to-left", () => {
  const src = `a "^5.9.0" b "^4.0.0" c`;
  const out = applyEdits(src, [
   { span: [2, 10], text: '"^7.1.0"' },
   { span: [13, 21], text: '"^4.2.0"' },
  ]);
  expect(out).toBe(`a "^7.1.0" b "^4.2.0" c`);
 });

 it("is a no-op for an empty edit list", () => {
  expect(applyEdits("x", [])).toBe("x");
 });

 it("throws on overlapping spans", () => {
  expect(() => applyEdits("abcdef", [{ span: [0, 3], text: "X" }, { span: [2, 5], text: "Y" }])).toThrow(RangeError);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/rewrite.test.ts`
Expected: FAIL — cannot find module `../../src/cli/rewrite.js`.

- [ ] **Step 3: Implement `rewrite.ts`**

Create `package/src/cli/rewrite.ts`:

```ts
import type { Edit } from "./types.js";

/**
 * Apply span replacements to a source string. Edits are applied in descending
 * start order so each edit's offsets remain valid as later text shifts. Throws
 * a RangeError if any two edits overlap.
 *
 * @internal
 */
export function applyEdits(source: string, edits: readonly Edit[]): string {
 const sorted = [...edits].sort((a, b) => b.span[0] - a.span[0]);
 for (let i = 1; i < sorted.length; i++) {
  const prev = sorted[i - 1];
  const cur = sorted[i];
  if (cur.span[1] > prev.span[0]) {
   throw new RangeError(`Overlapping edits at [${cur.span[0]}, ${cur.span[1]}) and [${prev.span[0]}, ${prev.span[1]})`);
  }
 }
 let out = source;
 for (const edit of sorted) {
  out = out.slice(0, edit.span[0]) + edit.text + out.slice(edit.span[1]);
 }
 return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/rewrite.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/rewrite.ts package/__test__/cli/rewrite.test.ts
git commit -m "feat: add span-edit rewriter

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 5: `resolve.ts` — RegistryResolver service (pnpm view)

**Files:**

- Create: `package/src/cli/resolve.ts`
- Test: `package/__test__/cli/resolve.test.ts`

**Interfaces:**

- Produces:
  - `class ResolveError extends Data.TaggedError("ResolveError")<{ readonly pkg: string; readonly message: string }>`
  - `class RegistryResolver extends Context.Tag("RegistryResolver")<RegistryResolver, { readonly versions: (pkg: string) => Effect.Effect<string[], ResolveError> }>()`
  - `const RegistryResolverLive: Layer.Layer<RegistryResolver, never, CommandExecutor.CommandExecutor>` — runs `pnpm view <pkg> versions --json`, parses the JSON array (or single-string form), returns versions.

- [ ] **Step 1: Write the failing test (against a stub layer)**

Create `package/__test__/cli/resolve.test.ts`:

```ts
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { RegistryResolver, ResolveError } from "../../src/cli/resolve.js";

const StubOk = Layer.succeed(RegistryResolver, {
 versions: (pkg) => Effect.succeed(pkg === "typescript" ? ["5.9.0", "5.9.3"] : []),
});

describe("RegistryResolver (contract)", () => {
 it("returns the versions for a package", async () => {
  const out = await Effect.runPromise(
   Effect.gen(function* () {
    const r = yield* RegistryResolver;
    return yield* r.versions("typescript");
   }).pipe(Effect.provide(StubOk)),
  );
  expect(out).toEqual(["5.9.0", "5.9.3"]);
 });

 it("ResolveError carries the package name", () => {
  const err = new ResolveError({ pkg: "x", message: "boom" });
  expect(err.pkg).toBe("x");
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/resolve.test.ts`
Expected: FAIL — cannot find module `../../src/cli/resolve.js`.

- [ ] **Step 3: Implement `resolve.ts`**

Create `package/src/cli/resolve.ts`:

```ts
import { Command, CommandExecutor } from "@effect/platform";
import { Context, Data, Effect, Layer } from "effect";

/**
 * Typed failure raised when a package's versions cannot be resolved.
 *
 * @internal
 */
export class ResolveError extends Data.TaggedError("ResolveError")<{
 readonly pkg: string;
 readonly message: string;
}> {}

/**
 * Resolves the published versions of a package from the registry. The Live
 * implementation shells out to `pnpm view`, reusing the user's .npmrc, scoped
 * registries, and auth tokens.
 *
 * @internal
 */
export class RegistryResolver extends Context.Tag("RegistryResolver")<
 RegistryResolver,
 { readonly versions: (pkg: string) => Effect.Effect<string[], ResolveError> }
>() {}

/** Parse `pnpm view ... versions --json` stdout: a JSON array, or a single JSON string. */
function parseVersions(pkg: string, stdout: string): Effect.Effect<string[], ResolveError> {
 return Effect.try({
  try: () => {
   const json = JSON.parse(stdout) as unknown;
   if (Array.isArray(json)) return json.map(String);
   if (typeof json === "string") return [json];
   throw new Error("unexpected shape");
  },
  catch: () => new ResolveError({ pkg, message: `Could not parse versions for ${pkg}` }),
 });
}

/**
 * Live RegistryResolver backed by `pnpm view <pkg> versions --json`.
 *
 * @internal
 */
export const RegistryResolverLive: Layer.Layer<RegistryResolver, never, CommandExecutor.CommandExecutor> =
 Layer.effect(
  RegistryResolver,
  Effect.gen(function* () {
   const executor = yield* CommandExecutor.CommandExecutor;
   return {
    versions: (pkg: string) =>
     Effect.gen(function* () {
      const cmd = Command.make("pnpm", "view", pkg, "versions", "--json");
      const stdout = yield* executor.string(cmd).pipe(
       Effect.mapError((e) => new ResolveError({ pkg, message: String(e) })),
      );
      return yield* parseVersions(pkg, stdout);
     }),
   };
  }),
 );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/resolve.test.ts`
Expected: PASS (2 tests). If `CommandExecutor.CommandExecutor.string` is not the exact call to capture stdout in the installed `@effect/platform`, adjust to the real API (e.g. `Command.string(cmd)` provided with the executor). The service interface and `parseVersions` stay the same.

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/resolve.ts package/__test__/cli/resolve.test.ts
git commit -m "feat: add RegistryResolver service backed by pnpm view

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 6: `upgrade` command (non-interactive) + bin wiring

**Files:**

- Create: `package/src/cli/commands/upgrade.ts`
- Create: `package/src/cli/bin.ts`
- Replace: `package/src/cli/index.ts` (barrel, no longer the bin)
- Modify: `package/package.json` (`bin` → `./src/cli/bin.ts`)
- Test: `package/__test__/cli/upgrade.int.test.ts`
- Create fixture dir helper: `package/__test__/cli/utils/tmp-config.ts`

**Interfaces:**

- Consumes: `discoverCatalogEntries` (Task 2), `planEntry` (Task 3), `applyEdits` (Task 4), `RegistryResolver` (Task 5), `Edit` (Task 1).
- Produces:
  - `function runUpgrade(opts: { file: string; resolver: { versions: (pkg: string) => Effect.Effect<string[], unknown> } }): Effect.Effect<{ updated: number; skipped: string[] }, UpgradeError>` — the testable core: read file, discover, resolve+plan each entry, build edits for the latest-in-range candidate (and its peer), write the file. Non-interactive: never selects a major. Returns counts.
  - `class UpgradeError extends Data.TaggedError("UpgradeError")<{ readonly message: string }>`
  - `const upgradeCommand` — the `@effect/cli` command (alias `up`) wrapping `runUpgrade` with the Live resolver.

- [ ] **Step 1: Write the failing integration test**

Create `package/__test__/cli/utils/tmp-config.ts`:

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Write `source` to a temp `.ts` file and return its path. */
export function writeTmpConfig(source: string): string {
 const dir = mkdtempSync(join(tmpdir(), "rpc-cli-"));
 const file = join(dir, "config.ts");
 writeFileSync(file, source, "utf8");
 return file;
}
```

Create `package/__test__/cli/upgrade.int.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runUpgrade } from "../../src/cli/commands/upgrade.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: {
  silk: {
   packages: {
    typescript: "^5.9.0",
    vitest: { range: "^4.0.0", peer: "^4.0.0", strategy: "lock-minor" },
   },
  },
 },
});
`;

const resolver = {
 versions: (pkg: string) =>
  Effect.succeed(pkg === "typescript" ? ["5.9.0", "5.9.3", "6.0.0"] : ["4.0.0", "4.2.3", "5.0.0"]),
};

describe("runUpgrade (non-interactive)", () => {
 it("rewrites ranges to latest-in-range and recomputes peer, never crossing a major", async () => {
  const file = writeTmpConfig(SOURCE);
  const out = await Effect.runPromise(runUpgrade({ file, resolver }));
  const result = readFileSync(file, "utf8");
  // typescript ^5.9.0 -> ^5.9.3 (not 6.0.0)
  expect(result).toContain('typescript: "^5.9.3"');
  // vitest range ^4.0.0 -> ^4.2.3, peer recomputed via lock-minor -> ^4.2.0
  expect(result).toContain('range: "^4.2.3"');
  expect(result).toContain('peer: "^4.2.0"');
  expect(result).not.toContain("6.0.0");
  expect(out.updated).toBe(2);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/upgrade.int.test.ts`
Expected: FAIL — cannot find module `../../src/cli/commands/upgrade.js`.

- [ ] **Step 3: Implement `commands/upgrade.ts`**

Create `package/src/cli/commands/upgrade.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { Args, Command, Options } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Data, Effect } from "effect";
import { discoverCatalogEntries } from "../discover.js";
import { planEntry } from "../plan.js";
import { RegistryResolver, RegistryResolverLive } from "../resolve.js";
import { applyEdits } from "../rewrite.js";
import type { Edit } from "../types.js";

/**
 * Typed failure raised when the upgrade run cannot complete.
 *
 * @internal
 */
export class UpgradeError extends Data.TaggedError("UpgradeError")<{ readonly message: string }> {}

interface Resolver {
 readonly versions: (pkg: string) => Effect.Effect<string[], unknown>;
}

/**
 * Non-interactive upgrade core: read the config, discover catalog entries,
 * resolve + plan each, build edits for the latest-IN-RANGE candidate (and its
 * recomputed peer literal), and write the file. Never selects a major bump.
 *
 * @internal
 */
export function runUpgrade(opts: {
 file: string;
 resolver: Resolver;
}): Effect.Effect<{ updated: number; skipped: string[] }, UpgradeError> {
 return Effect.gen(function* () {
  const source = yield* Effect.try({
   try: () => readFileSync(opts.file, "utf8"),
   catch: () => new UpgradeError({ message: `Cannot read ${opts.file}` }),
  });
  const { entries, skipped } = discoverCatalogEntries(source, opts.file);
  const edits: Edit[] = [];

  for (const entry of entries) {
   const versions = yield* opts.resolver
    .versions(entry.pkg)
    .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));
   const candidates = yield* planEntry(entry, versions).pipe(
    Effect.catchAll(() => Effect.succeed([])),
   );
   const inRange = candidates.find((c) => c.kind === "in-range");
   if (!inRange) continue;
   edits.push({ span: entry.rangeSpan, text: JSON.stringify(inRange.range) });
   if (entry.peer && inRange.peerRange) {
    edits.push({ span: entry.peer.span, text: JSON.stringify(inRange.peerRange) });
   }
  }

  if (edits.length > 0) {
   const next = applyEdits(source, edits);
   yield* Effect.try({
    try: () => writeFileSync(opts.file, next, "utf8"),
    catch: () => new UpgradeError({ message: `Cannot write ${opts.file}` }),
   });
  }

  // An entry counts as updated when a range edit was queued for its range span.
  const updated = entries.filter((e) => edits.some((ed) => ed.span[0] === e.rangeSpan[0])).length;
  return { updated, skipped };
 });
}

const fileArg = Args.file({ name: "file", exists: "yes" });
const yesFlag = Options.boolean("yes").pipe(Options.withAlias("y"), Options.withDefault(false));

/**
 * The `upgrade` command (alias `up`). B1 implements only the non-interactive
 * `--yes` path (latest in-range); interactive selection is Phase B2.
 *
 * @internal
 */
export const upgradeCommand = Command.make("upgrade", { file: fileArg, yes: yesFlag }, ({ file }) =>
 Effect.gen(function* () {
  const resolver = yield* RegistryResolver;
  const result = yield* runUpgrade({ file, resolver }).pipe(
   Effect.catchAll((e) => Effect.fail(e)),
  );
  yield* Effect.sync(() =>
   process.stdout.write(`Updated ${result.updated} package(s); skipped ${result.skipped.length}.\n`),
  );
 }).pipe(Effect.provide(RegistryResolverLive), Effect.provide(NodeContext.layer)),
).pipe(Command.withDescription("Upgrade catalog versions in a config file"));
```

- [ ] **Step 4: Implement `bin.ts` and the barrel, wire `package.json`**

Replace `package/src/cli/index.ts` with a barrel:

```ts
export { runUpgrade, upgradeCommand } from "./commands/upgrade.js";
```

Create `package/src/cli/bin.ts`:

```ts
#!/usr/bin/env node
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { upgradeCommand } from "./commands/upgrade.js";

const root = Command.make("rolldown-pnpm-config").pipe(Command.withSubcommands([upgradeCommand]));

const cli = Command.run(root, { name: "rolldown-pnpm-config", version: process.env.__PACKAGE_VERSION__ ?? "0.0.0" });

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
```

In `package/package.json`, point the bin at the new entry:

```jsonc
"bin": { "rolldown-pnpm-config": "./src/cli/bin.ts" }
```

(The bin already points here per the source `package.json`; confirm it still does and that `src/cli/index.ts` is no longer referenced as the bin.)

- [ ] **Step 5: Run the integration test**

Run: `pnpm vitest run package/__test__/cli/upgrade.int.test.ts`
Expected: PASS — the temp file is rewritten to `^5.9.3` and `^4.2.3`/peer `^4.2.0`, no `6.0.0`, `updated === 2`.

- [ ] **Step 6: Typecheck, full suite, and adjust coverage thresholds**

Run: `pnpm run typecheck`
Expected: PASS.

Run: `pnpm run test`
Expected: tests pass, but the v8 coverage gate MAY fail because the CLI shell (`bin.ts`, the Live resolver's `pnpm` call, the `@effect/cli` command wiring) adds uncovered lines.

If — and only if — coverage fails its thresholds, lower them in `vitest.config.ts`. Read the achieved percentages from the coverage summary printed by the failed run, then override the `basic` thresholds with values at the floor of what was achieved (round down to a whole number; do not pad). Replace:

```ts
thresholds: AgentPlugin.COVERAGE_LEVELS.basic.thresholds,
```

with an explicit override that spreads the basic thresholds and lowers only the metrics that failed, e.g.:

```ts
// CLI shell (bin.ts, Live resolver, command wiring) is not unit-coverable;
// thresholds lowered to the floor of achieved coverage (see B1 plan).
thresholds: {
 ...AgentPlugin.COVERAGE_LEVELS.basic.thresholds,
 lines: <achieved-floor>,
 functions: <achieved-floor>,
 branches: <achieved-floor>,
 statements: <achieved-floor>,
},
```

Use the actual numbers from the run for `<achieved-floor>` (only the metrics that breached need lowering; leave the others at the basic value). Re-run `pnpm run test` and confirm the gate passes. If coverage already passes without changes, skip this edit entirely and do not touch `vitest.config.ts`.

- [ ] **Step 7: Smoke-test the built CLI is wired (optional but recommended)**

Run: `pnpm exec tsx package/src/cli/bin.ts upgrade --help` (or `node` via the build). Expected: help text listing the `file` arg and `--yes`. If `tsx` is unavailable, skip — the integration test already covers `runUpgrade`.

- [ ] **Step 8: Commit**

```bash
git add package/src/cli/commands/upgrade.ts package/src/cli/bin.ts package/src/cli/index.ts package/package.json package/__test__/cli/upgrade.int.test.ts package/__test__/cli/utils/tmp-config.ts vitest.config.ts
git commit -m "feat: add non-interactive upgrade command and bin entry

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

## Self-Review

**Spec coverage (Phase B portions covered by B1):**

- `discover.ts` static oxc parse → CatalogEntry[] with spans, skip non-literal/complex → Task 2. ✓
- `resolve.ts` via `pnpm view` (reuses .npmrc/auth) → Task 5. ✓
- `plan.ts` latest-in-range + latest-overall + keep, prereleases excluded, operator preserved → Task 3. ✓
- `rewrite.ts` right-to-left span edits, atomic single-file write → Task 4 + Task 6. ✓
- CLI-only `derivePeerRange(range, strategy)` (deferred from Phase A) → Task 1. ✓
- Non-interactive `upgrade --yes` = latest-in-range, never a major; rewrites both range and peer literals → Task 6. ✓
- Bin `rolldown-pnpm-config`, source under `package/src/cli/` → Task 6. ✓

**Deferred to Phase B2 (separate plan):** interactive Ink walk (per-package selection, footer tally), drift detection + resync, dry-run diff, confirmation summary, `--catalog` filter, autodetect-default-file, and surfacing `skipped` entries with guidance. B1 deliberately ships the non-interactive core only; `runUpgrade` and all pure units are the seams B2 builds on.

**Placeholder scan:** no TBD/TODO; every code step has complete code.

**Type consistency:** `CatalogEntry`, `Candidate`, `Edit` (Task 1) are used with identical fields in Tasks 2–6. `derivePeerRange(range, strategy)` (Task 1) is consumed by `planEntry` (Task 3). `RegistryResolver.versions(pkg)` (Task 5) is consumed by `runUpgrade` (Task 6). `planEntry` returns candidates whose `in-range` entry drives the edits in `runUpgrade`.

**External-API risk (flagged for execution):** three spots depend on exact third-party surfaces that the implementer must confirm against the installed packages and adjust without changing the algorithm: (1) oxc node type names (`Literal` vs `StringLiteral`) and key access in Task 2; (2) `semver-effect` `Range`/`SemVer` method names in Task 3; (3) `@effect/platform` `CommandExecutor`/`Command.string` stdout capture in Task 5. Each task's run-step calls this out.
