# Phase B2 — Interactive Upgrade Walk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `rolldown-pnpm-config upgrade <file>` (no `--yes`) an interactive Ink walk: one package at a time, choose latest-in-range / latest-overall(major) / keep, with peer recompute, drift-resync, a confirmation diff, `--dry-run`, `--catalog`, and config-file autodetect.

**Architecture:** All decision logic is pure and unit-tested — `drift` (peer resync detection), `walk-plan` (per-entry candidates + up-to-date + drift), `walk-reducer` (the keyboard-driven selection state machine), `edits` (decisions → span edits), `summary` (decisions → diff text), `select-file` (autodetect). The Ink layer is a thin `Walk` component that drives `walk-reducer` via `useInput`, plus a `runWalk` bridge that renders it inside an Effect. The command's default path resolves+plans, runs the walk, prints the confirmation diff, and applies (or, with `--dry-run`, prints and exits). B1's `discover`/`plan`/`rewrite`/`resolve` units are reused unchanged.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, `@effect/cli`, `ink`, `react`, `ink-testing-library`, `oxc-parser`, `semver-effect`, Vitest, Biome.

## Global Constraints

- Relative imports MUST use `.js` extensions; Node built-ins MUST use `node:` protocol; type-only imports MUST use `import type`. No import cycles. Tests under `package/__test__/cli/`.
- Default (no `-y/--yes`) = interactive walk. `--yes` stays the non-interactive latest-in-range path (B1, unchanged). `--dry-run` prints the diff and writes nothing. `--catalog <name>` limits to one catalog.
- Major bumps are interactive-only: the walk MAY offer the `latest` (major) candidate; `--yes` never does. A confirmation diff is shown before any write, even interactively.
- Operator preservation and span-replacement rewriting are reused from B1 (only existing string literals are replaced). NOT in scope: materializing a brand-new `peer` literal when a package has `strategy` but no `peer` (that needs AST insertion, not span replacement — see Out of Scope).
- New deps (`ink`, `react`, `ink-testing-library`, `@types/react`) go in `package/package.json` (runtime deps for ink/react; `ink-testing-library` + `@types/react` in devDependencies). None are in the silk catalog → use concrete caret ranges at the latest stable (`pnpm view <pkg> version`).
- The runtime engine (`package/src/catalogs.ts`, `freeze.ts`, `strategies/`, descriptors) is NOT modified. CLI code lives only under `package/src/cli/`.
- Coverage: the Ink render shell + the command wiring are not fully unit-coverable; the pure units (drift, walk-plan, walk-reducer, edits, summary, select-file) MUST be tested. If the full-suite coverage gate fails after this phase, lower the thresholds in `vitest.config.ts` to the floor of achieved coverage (same approach the project chose in B1), not per-file excludes.
- Commits require conventional-commit format + DCO signoff: `Signed-off-by: C. Spencer Beggs <spencer@beg.gs>`. Commit bodies must NOT contain markdown inline code (backticks) — the `silk/body-no-markdown` commitlint rule rejects them.
- Run a single test file with: `pnpm vitest run <path>`.

## Shared types (created in Task 2, referenced throughout)

```ts
// package/src/cli/walk-types.ts
import type { Candidate, CatalogEntry } from "./types.js";

/** One package's interactive choice surface. */
export interface WalkItem {
 readonly entry: CatalogEntry;
 /** Candidates from planEntry: [in-range?, latest?, keep] (keep always last). */
 readonly candidates: readonly Candidate[];
 /** True when the only candidate is keep (already at newest). */
 readonly upToDate: boolean;
 /** A peer range to resync to (existing peer literal drifted from strategy), else null. */
 readonly driftPeer: string | null;
}

/** The user's resolved choice for one item. */
export interface Decision {
 readonly item: WalkItem;
 readonly chosen: Candidate;
}
```

## Reused B1 interfaces (do not redefine)

- `discoverCatalogEntries(source, filename): { entries: CatalogEntry[]; skipped: string[] }` (throws `DiscoverError`).
- `CatalogEntry { catalog, pkg, currentRange, operator, rangeSpan, peer?: { value, span }, strategy? }`.
- `planEntry(entry, versions): Effect<Candidate[], PeerRangeError>`.
- `Candidate { kind: "in-range" | "latest" | "keep", range, version, isMajor, peerRange? }`.
- `derivePeerRange(range, strategy): Effect<string, PeerRangeError>`.
- `applyEdits(source, edits): string`; `Edit { span, text }`.
- `RegistryResolver` / `RegistryResolverLive`.

---

### Task 1: Add deps + `drift.ts` (peer drift detection)

**Files:**

- Modify: `package/package.json` (add ink/react deps)
- Create: `package/src/cli/drift.ts`
- Test: `package/__test__/cli/drift.test.ts`

**Interfaces:**

- Consumes: `derivePeerRange` (B1), `CatalogEntry` (B1).
- Produces: `function detectPeerDrift(entry: CatalogEntry): Effect.Effect<string | null, PeerRangeError>` — when the entry has BOTH a materialized `peer` and a `strategy`, compute the expected peer from the CURRENT range (`derivePeerRange(entry.currentRange, entry.strategy)`); return it when it differs from `entry.peer.value` (drift → resync target), else `null`. Returns `null` when the entry lacks a peer or strategy.

- [ ] **Step 1: Add the dependencies**

Find latest stable versions, then add to `package/package.json`:

```bash
pnpm view ink version; pnpm view react version; pnpm view ink-testing-library version; pnpm view @types/react version
```

Add to `dependencies`: `ink` and `react` (concrete caret ranges). Add to `devDependencies`: `ink-testing-library` and `@types/react`. Then:

```bash
pnpm install
ls node_modules/.pnpm | grep -iE "^ink@|^react@|ink-testing" | head
```

(Confirm resolution via the pnpm store the way B1 did — these install into the package workspace.)

- [ ] **Step 2: Write the failing test**

Create `package/__test__/cli/drift.test.ts`:

```ts
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { detectPeerDrift } from "../../src/cli/drift.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
 catalog: "silk",
 pkg: "vitest",
 currentRange: "^4.2.3",
 operator: "^",
 rangeSpan: [0, 8],
 ...over,
});

const run = (e: CatalogEntry) => Effect.runPromise(detectPeerDrift(e));

describe("detectPeerDrift", () => {
 it("returns the resync target when the materialized peer drifts from strategy", async () => {
  // current ^4.2.3 + lock-minor would yield ^4.2.0, but peer says ^4.1.0 → drift.
  const e = entry({ strategy: "lock-minor", peer: { value: "^4.1.0", span: [10, 18] } });
  await expect(run(e)).resolves.toBe("^4.2.0");
 });

 it("returns null when the peer already matches strategy", async () => {
  const e = entry({ strategy: "lock-minor", peer: { value: "^4.2.0", span: [10, 18] } });
  await expect(run(e)).resolves.toBeNull();
 });

 it("returns null when there is no strategy or no peer", async () => {
  await expect(run(entry({ peer: { value: "^4.2.0", span: [10, 18] } }))).resolves.toBeNull();
  await expect(run(entry({ strategy: "lock-minor" }))).resolves.toBeNull();
 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/drift.test.ts`
Expected: FAIL — cannot find module `../../src/cli/drift.js`.

- [ ] **Step 4: Implement `drift.ts`**

Create `package/src/cli/drift.ts`:

```ts
import { Effect } from "effect";
import { derivePeerRange, type PeerRangeError } from "./peer-range.js";
import type { CatalogEntry } from "./types.js";

/**
 * Detect whether an entry's materialized peer range has drifted from what its
 * strategy would produce from the CURRENT range. Returns the resync target (the
 * up-to-date peer range) on drift, or null when in sync or not applicable
 * (missing peer or strategy).
 *
 * @internal
 */
export function detectPeerDrift(entry: CatalogEntry): Effect.Effect<string | null, PeerRangeError> {
 return Effect.gen(function* () {
  if (!entry.peer || !entry.strategy) return null;
  const expected = yield* derivePeerRange(entry.currentRange, entry.strategy);
  return expected === entry.peer.value ? null : expected;
 });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/drift.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package/package.json pnpm-lock.yaml package/src/cli/drift.ts package/__test__/cli/drift.test.ts
git commit -m "feat: add interactive deps and peer drift detection

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 2: `walk-plan.ts` — build per-entry walk items

**Files:**

- Create: `package/src/cli/walk-types.ts`
- Create: `package/src/cli/walk-plan.ts`
- Test: `package/__test__/cli/walk-plan.test.ts`

**Interfaces:**

- Consumes: `planEntry` (B1), `detectPeerDrift` (Task 1), `CatalogEntry`/`Candidate` (B1).
- Produces:
  - `walk-types.ts` exporting `WalkItem`, `Decision` (see Shared types).
  - `function buildWalkItems(entries: readonly CatalogEntry[], versionsByPkg: ReadonlyMap<string, readonly string[]>): Effect.Effect<WalkItem[], PeerRangeError>` — per entry: `candidates = planEntry(entry, versionsByPkg.get(entry.pkg) ?? [])`, `upToDate = candidates.length === 1` (only keep), `driftPeer = detectPeerDrift(entry)`.

- [ ] **Step 1: Create `walk-types.ts`**

Create `package/src/cli/walk-types.ts` with exactly the content from the "Shared types" section above.

- [ ] **Step 2: Write the failing test**

Create `package/__test__/cli/walk-plan.test.ts`:

```ts
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { buildWalkItems } from "../../src/cli/walk-plan.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
 catalog: "silk",
 pkg: "typescript",
 currentRange: "^5.9.0",
 operator: "^",
 rangeSpan: [0, 8],
 ...over,
});

const run = (entries: CatalogEntry[], v: Record<string, string[]>) =>
 Effect.runPromise(buildWalkItems(entries, new Map(Object.entries(v))));

describe("buildWalkItems", () => {
 it("attaches candidates, upToDate, and drift per entry", async () => {
  const items = await run(
   [
    entry({ pkg: "typescript", currentRange: "^5.9.0", rangeSpan: [0, 8] }),
    entry({ pkg: "vitest", currentRange: "^4.2.3", rangeSpan: [10, 18], strategy: "lock-minor", peer: { value: "^4.1.0", span: [20, 28] } }),
   ],
   { typescript: ["5.9.0", "5.9.3", "7.1.0"], vitest: ["4.2.3"] },
  );
  const ts = items.find((i) => i.entry.pkg === "typescript")!;
  expect(ts.candidates.map((c) => c.kind)).toEqual(["in-range", "latest", "keep"]);
  expect(ts.upToDate).toBe(false);

  const vitest = items.find((i) => i.entry.pkg === "vitest")!;
  expect(vitest.upToDate).toBe(true); // only keep (already newest)
  expect(vitest.driftPeer).toBe("^4.2.0"); // peer ^4.1.0 drifted from lock-minor of ^4.2.3
 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/walk-plan.test.ts`
Expected: FAIL — cannot find module `../../src/cli/walk-plan.js`.

- [ ] **Step 4: Implement `walk-plan.ts`**

Create `package/src/cli/walk-plan.ts`:

```ts
import { Effect } from "effect";
import { detectPeerDrift } from "./drift.js";
import type { PeerRangeError } from "./peer-range.js";
import { planEntry } from "./plan.js";
import type { CatalogEntry } from "./types.js";
import type { WalkItem } from "./walk-types.js";

/**
 * Build the interactive walk items: for each entry, its candidate list (from
 * planEntry against the resolved versions), an up-to-date flag (only the keep
 * candidate remains), and any peer drift resync target.
 *
 * @internal
 */
export function buildWalkItems(
 entries: readonly CatalogEntry[],
 versionsByPkg: ReadonlyMap<string, readonly string[]>,
): Effect.Effect<WalkItem[], PeerRangeError> {
 return Effect.gen(function* () {
  const items: WalkItem[] = [];
  for (const entry of entries) {
   const versions = versionsByPkg.get(entry.pkg) ?? [];
   const candidates = yield* planEntry(entry, [...versions]);
   const driftPeer = yield* detectPeerDrift(entry);
   items.push({ entry, candidates, upToDate: candidates.length === 1, driftPeer });
  }
  return items;
 });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/walk-plan.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/walk-types.ts package/src/cli/walk-plan.ts package/__test__/cli/walk-plan.test.ts
git commit -m "feat: build per-entry interactive walk items

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 3: `edits.ts` + `summary.ts` — decisions to edits and diff text

**Files:**

- Create: `package/src/cli/edits.ts`
- Create: `package/src/cli/summary.ts`
- Test: `package/__test__/cli/edits.test.ts`
- Test: `package/__test__/cli/summary.test.ts`

**Interfaces:**

- Consumes: `Decision` (Task 2), `Edit` (B1).
- Produces:
  - `function buildEdits(decisions: readonly Decision[]): Edit[]` — for each decision: if `chosen.kind !== "keep"`, a range edit at `entry.rangeSpan` → `JSON.stringify(chosen.range)`, plus a peer edit at `entry.peer.span` → `JSON.stringify(chosen.peerRange)` when both exist. If `chosen.kind === "keep"` AND `item.driftPeer` and `entry.peer`, a peer-only resync edit at `entry.peer.span` → `JSON.stringify(item.driftPeer)`.
  - `function renderSummary(decisions: readonly Decision[]): string` — a human diff: one line per actual change (`silk › typescript  ^5.9.0 → ^5.9.3`), peer changes on an indented `↳ peer  ^x → ^y` line; nothing for no-op keeps; a trailing tally `N to update · M major · K up to date`.

- [ ] **Step 1: Write the failing tests**

Create `package/__test__/cli/edits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildEdits } from "../../src/cli/edits.js";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import type { Decision, WalkItem } from "../../src/cli/walk-types.js";

const entry = (o: Partial<CatalogEntry>): CatalogEntry => ({
 catalog: "silk", pkg: "x", currentRange: "^1.0.0", operator: "^", rangeSpan: [0, 8], ...o,
});
const cand = (o: Partial<Candidate>): Candidate => ({ kind: "in-range", range: "^1.2.0", version: "1.2.0", isMajor: false, ...o });
const item = (e: CatalogEntry, over: Partial<WalkItem> = {}): WalkItem => ({ entry: e, candidates: [], upToDate: false, driftPeer: null, ...over });

describe("buildEdits", () => {
 it("emits a range edit and a peer edit for a chosen upgrade with strategy", () => {
  const e = entry({ rangeSpan: [0, 8], peer: { value: "^1.0.0", span: [10, 18] }, strategy: "lock-minor" });
  const d: Decision = { item: item(e), chosen: cand({ range: "^1.2.0", peerRange: "^1.2.0" }) };
  expect(buildEdits([d])).toEqual([
   { span: [0, 8], text: '"^1.2.0"' },
   { span: [10, 18], text: '"^1.2.0"' },
  ]);
 });

 it("emits no edit for a plain keep", () => {
  const e = entry({});
  expect(buildEdits([{ item: item(e), chosen: cand({ kind: "keep", range: "^1.0.0" }) }])).toEqual([]);
 });

 it("emits a peer-only resync edit when keeping but the peer drifted", () => {
  const e = entry({ peer: { value: "^1.0.0", span: [10, 18] }, strategy: "lock-minor" });
  const d: Decision = { item: item(e, { driftPeer: "^1.1.0" }), chosen: cand({ kind: "keep", range: "^1.0.0" }) };
  expect(buildEdits([d])).toEqual([{ span: [10, 18], text: '"^1.1.0"' }]);
 });
});
```

Create `package/__test__/cli/summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderSummary } from "../../src/cli/summary.js";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import type { Decision, WalkItem } from "../../src/cli/walk-types.js";

const entry = (o: Partial<CatalogEntry>): CatalogEntry => ({
 catalog: "silk", pkg: "typescript", currentRange: "^5.9.0", operator: "^", rangeSpan: [0, 8], ...o,
});
const cand = (o: Partial<Candidate>): Candidate => ({ kind: "in-range", range: "^5.9.3", version: "5.9.3", isMajor: false, ...o });
const item = (e: CatalogEntry, over: Partial<WalkItem> = {}): WalkItem => ({ entry: e, candidates: [], upToDate: false, driftPeer: null, ...over });

describe("renderSummary", () => {
 it("lists changes and a tally", () => {
  const d: Decision = { item: item(entry({})), chosen: cand({}) };
  const out = renderSummary([d]);
  expect(out).toContain("silk");
  expect(out).toContain("typescript");
  expect(out).toContain("^5.9.0");
  expect(out).toContain("^5.9.3");
  expect(out).toContain("1 to update");
 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run package/__test__/cli/edits.test.ts package/__test__/cli/summary.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `edits.ts`**

Create `package/src/cli/edits.ts`:

```ts
import type { Edit } from "./types.js";
import type { Decision } from "./walk-types.js";

/**
 * Convert resolved decisions into span edits. A chosen upgrade rewrites the
 * range literal (and the existing peer literal when the candidate carries a
 * recomputed peerRange). A keep with peer drift rewrites only the peer literal
 * to the resync target.
 *
 * @internal
 */
export function buildEdits(decisions: readonly Decision[]): Edit[] {
 const edits: Edit[] = [];
 for (const { item, chosen } of decisions) {
  const { entry } = item;
  if (chosen.kind !== "keep") {
   edits.push({ span: entry.rangeSpan, text: JSON.stringify(chosen.range) });
   if (entry.peer && chosen.peerRange) {
    edits.push({ span: entry.peer.span, text: JSON.stringify(chosen.peerRange) });
   }
  } else if (entry.peer && item.driftPeer) {
   edits.push({ span: entry.peer.span, text: JSON.stringify(item.driftPeer) });
  }
 }
 return edits;
}
```

- [ ] **Step 4: Implement `summary.ts`**

Create `package/src/cli/summary.ts`:

```ts
import type { Decision } from "./walk-types.js";

/**
 * Render a human-readable diff of the pending decisions: one line per real
 * change, peer changes indented, ending with an update/major/up-to-date tally.
 *
 * @internal
 */
export function renderSummary(decisions: readonly Decision[]): string {
 const lines: string[] = [];
 let toUpdate = 0;
 let major = 0;
 let upToDate = 0;
 for (const { item, chosen } of decisions) {
  const { entry } = item;
  if (chosen.kind !== "keep") {
   toUpdate++;
   if (chosen.isMajor) major++;
   lines.push(`  ${entry.catalog} › ${entry.pkg}  ${entry.currentRange} → ${chosen.range}`);
   if (entry.peer && chosen.peerRange && chosen.peerRange !== entry.peer.value) {
    lines.push(`    ↳ peer  ${entry.peer.value} → ${chosen.peerRange}`);
   }
  } else if (entry.peer && item.driftPeer) {
   lines.push(`  ${entry.catalog} › ${entry.pkg}  (resync peer)`);
   lines.push(`    ↳ peer  ${entry.peer.value} → ${item.driftPeer}`);
  } else {
   upToDate++;
  }
 }
 lines.push(`${toUpdate} to update · ${major} major · ${upToDate} up to date`);
 return lines.join("\n");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run package/__test__/cli/edits.test.ts package/__test__/cli/summary.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package/src/cli/edits.ts package/src/cli/summary.ts package/__test__/cli/edits.test.ts package/__test__/cli/summary.test.ts
git commit -m "feat: build edits and confirmation summary from decisions

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 4: `select-file.ts` (autodetect) + `--catalog` filter

**Files:**

- Create: `package/src/cli/select-file.ts`
- Test: `package/__test__/cli/select-file.test.ts`

**Interfaces:**

- Produces:
  - `function pickConfigCandidate(matches: readonly string[]): { ok: true; file: string } | { ok: false; message: string }` — pure: exactly one match → ok; zero → error "no config found"; more than one → error listing them.
  - `function filterEntriesByCatalog(entries: readonly CatalogEntry[], catalog: string | undefined): CatalogEntry[]` — pure: when `catalog` is set, keep only entries whose `catalog` matches; otherwise return all.

- [ ] **Step 1: Write the failing test**

Create `package/__test__/cli/select-file.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterEntriesByCatalog, pickConfigCandidate } from "../../src/cli/select-file.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const entry = (catalog: string, pkg: string): CatalogEntry => ({
 catalog, pkg, currentRange: "^1.0.0", operator: "^", rangeSpan: [0, 8],
});

describe("pickConfigCandidate", () => {
 it("returns the single match", () => {
  expect(pickConfigCandidate(["a.ts"])).toEqual({ ok: true, file: "a.ts" });
 });
 it("errors on zero matches", () => {
  expect(pickConfigCandidate([])).toMatchObject({ ok: false });
 });
 it("errors on multiple matches and lists them", () => {
  const r = pickConfigCandidate(["a.ts", "b.ts"]);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toContain("a.ts");
 });
});

describe("filterEntriesByCatalog", () => {
 const entries = [entry("silk", "a"), entry("react", "b")];
 it("returns all when no catalog given", () => {
  expect(filterEntriesByCatalog(entries, undefined)).toHaveLength(2);
 });
 it("filters to the named catalog", () => {
  const out = filterEntriesByCatalog(entries, "silk");
  expect(out.map((e) => e.pkg)).toEqual(["a"]);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/select-file.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `select-file.ts`**

Create `package/src/cli/select-file.ts`:

```ts
import type { CatalogEntry } from "./types.js";

/**
 * Choose the config file to operate on from a set of candidate paths. Exactly
 * one is required; zero or many is an error the caller surfaces.
 *
 * @internal
 */
export function pickConfigCandidate(
 matches: readonly string[],
): { ok: true; file: string } | { ok: false; message: string } {
 if (matches.length === 1) return { ok: true, file: matches[0] };
 if (matches.length === 0) {
  return { ok: false, message: "No config file found. Pass a file path explicitly." };
 }
 return { ok: false, message: `Multiple config files found; pass one explicitly: ${matches.join(", ")}` };
}

/**
 * Restrict entries to a single catalog by name, or return all when undefined.
 *
 * @internal
 */
export function filterEntriesByCatalog(
 entries: readonly CatalogEntry[],
 catalog: string | undefined,
): CatalogEntry[] {
 return catalog === undefined ? [...entries] : entries.filter((e) => e.catalog === catalog);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/select-file.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package/src/cli/select-file.ts package/__test__/cli/select-file.test.ts
git commit -m "feat: add config-file autodetect and catalog filter

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 5: walk reducer + Ink `Walk` component + `runWalk` bridge

**Files:**

- Create: `package/src/cli/walk-reducer.ts`
- Create: `package/src/cli/ui/Walk.tsx`
- Create: `package/src/cli/ui/run-walk.ts`
- Test: `package/__test__/cli/walk-reducer.test.ts`
- Test: `package/__test__/cli/walk-ui.test.tsx`

**Interfaces:**

- Consumes: `WalkItem`, `Decision` (Task 2).
- Produces:
  - `interface WalkState { readonly index: number; readonly cursor: number; readonly decisions: readonly Decision[]; readonly done: boolean }`
  - `function initWalk(items: readonly WalkItem[]): WalkState` — starts at the first NON-up-to-date item (auto-skips up-to-date), cursor 0; `done` immediately if no actionable items.
  - `function walkStep(state: WalkState, items: readonly WalkItem[], key: "up" | "down" | "enter"): WalkState` — up/down move the cursor within the current item's candidates; enter records the highlighted candidate as a Decision and advances to the next non-up-to-date item (or `done`).
  - `function runWalk(items: readonly WalkItem[]): Effect.Effect<Decision[], never>` — renders `Walk` with Ink and resolves with the collected decisions when done.

- [ ] **Step 1: Write the failing reducer test**

Create `package/__test__/cli/walk-reducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initWalk, walkStep } from "../../src/cli/walk-reducer.js";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import type { WalkItem } from "../../src/cli/walk-types.js";

const entry = (pkg: string): CatalogEntry => ({ catalog: "silk", pkg, currentRange: "^5.9.0", operator: "^", rangeSpan: [0, 8] });
const C = (kind: Candidate["kind"], range: string): Candidate => ({ kind, range, version: range.replace(/^[\^~]/, ""), isMajor: false });
const item = (pkg: string, upToDate: boolean, candidates: Candidate[]): WalkItem => ({ entry: entry(pkg), candidates, upToDate, driftPeer: null });

const ts = item("typescript", false, [C("in-range", "^5.9.3"), C("latest", "^7.1.0"), C("keep", "^5.9.0")]);
const ok = item("eslint", true, [C("keep", "^9.0.0")]);
const vi = item("vitest", false, [C("in-range", "^4.2.3"), C("keep", "^4.0.0")]);

describe("walk reducer", () => {
 it("starts on the first non-up-to-date item", () => {
  const s = initWalk([ok, ts, vi]);
  expect(s.index).toBe(1); // skips eslint (up to date)
  expect(s.done).toBe(false);
 });

 it("down moves the cursor, enter records the choice and advances", () => {
  let s = initWalk([ts, vi]);
  s = walkStep(s, [ts, vi], "down"); // cursor 0 → 1 (latest)
  expect(s.cursor).toBe(1);
  s = walkStep(s, [ts, vi], "enter"); // record latest for ts, advance to vitest
  expect(s.decisions).toHaveLength(1);
  expect(s.decisions[0].chosen.kind).toBe("latest");
  expect(s.index).toBe(1);
  expect(s.cursor).toBe(0);
  s = walkStep(s, [ts, vi], "enter"); // record in-range for vitest, done
  expect(s.done).toBe(true);
  expect(s.decisions.map((d) => d.chosen.kind)).toEqual(["latest", "in-range"]);
 });

 it("is done immediately when all items are up to date", () => {
  expect(initWalk([ok]).done).toBe(true);
 });
});
```

- [ ] **Step 2: Run reducer test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/walk-reducer.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `walk-reducer.ts`**

Create `package/src/cli/walk-reducer.ts`:

```ts
import type { Decision, WalkItem } from "./walk-types.js";

/** State of the interactive walk. */
export interface WalkState {
 readonly index: number;
 readonly cursor: number;
 readonly decisions: readonly Decision[];
 readonly done: boolean;
}

/** Index of the next actionable (not up-to-date) item at or after `from`, or -1. */
function nextActionable(items: readonly WalkItem[], from: number): number {
 for (let i = from; i < items.length; i++) {
  if (!items[i].upToDate) return i;
 }
 return -1;
}

/**
 * Initialize the walk on the first actionable item (auto-skipping up-to-date
 * items). If none are actionable, the walk is immediately done.
 *
 * @internal
 */
export function initWalk(items: readonly WalkItem[]): WalkState {
 const index = nextActionable(items, 0);
 return { index: index === -1 ? items.length : index, cursor: 0, decisions: [], done: index === -1 };
}

/**
 * Advance the walk by a key. up/down move the cursor within the current item's
 * candidates; enter records the highlighted candidate and moves to the next
 * actionable item (or completes).
 *
 * @internal
 */
export function walkStep(
 state: WalkState,
 items: readonly WalkItem[],
 key: "up" | "down" | "enter",
): WalkState {
 if (state.done) return state;
 const item = items[state.index];
 const count = item.candidates.length;
 if (key === "up") return { ...state, cursor: (state.cursor - 1 + count) % count };
 if (key === "down") return { ...state, cursor: (state.cursor + 1) % count };
 // enter
 const chosen = item.candidates[state.cursor];
 const decisions = [...state.decisions, { item, chosen }];
 const next = nextActionable(items, state.index + 1);
 if (next === -1) return { ...state, decisions, done: true };
 return { index: next, cursor: 0, decisions, done: false };
}
```

- [ ] **Step 4: Run reducer test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/walk-reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the Ink component and bridge (verify the Ink API first)**

CRITICAL: confirm the installed `ink` (and `react`) API before writing. The component uses `import { Box, Text, useApp, useInput } from "ink"` and `import { render } from "ink"`. `useInput((input, key) => { key.upArrow; key.downArrow; key.return })` is the input hook; `render(element)` returns an instance with `.unmount()` and `.waitUntilExit(): Promise<void>`. Verify these names against `node_modules/.pnpm/ink@*/node_modules/ink` types and adapt if they differ. `ink-testing-library` exposes `render(element)` → `{ lastFrame(), frames, stdin: { write }, rerender, unmount }`; arrow keys are the escape sequences `[A` (up) / `[B` (down); enter is `\r`.

Create `package/src/cli/ui/Walk.tsx`:

```tsx
import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";
import { initWalk, walkStep, type WalkState } from "../walk-reducer.js";
import type { Decision, WalkItem } from "../walk-types.js";

interface WalkProps {
 readonly items: readonly WalkItem[];
 readonly onDone: (decisions: readonly Decision[]) => void;
}

/** Interactive per-package upgrade selector. */
export function Walk({ items, onDone }: WalkProps): JSX.Element {
 const app = useApp();
 const [state, setState] = useState<WalkState>(() => {
  const s = initWalk(items);
  if (s.done) {
   onDone(s.decisions);
   app.exit();
  }
  return s;
 });

 useInput((_input, key) => {
  if (state.done) return;
  const which = key.upArrow ? "up" : key.downArrow ? "down" : key.return ? "enter" : null;
  if (!which) return;
  const next = walkStep(state, items, which);
  setState(next);
  if (next.done) {
   onDone(next.decisions);
   app.exit();
  }
 });

 if (state.done || state.index >= items.length) return <Text>Done.</Text>;
 const item = items[state.index];
 const e = item.entry;
 return (
  <Box flexDirection="column">
   <Text>
    {e.catalog} › {e.pkg}   current {e.currentRange}
    {e.peer ? `   peer ${e.peer.value}` : ""}
    {e.strategy ? `   strategy: ${e.strategy}` : ""}
   </Text>
   {item.candidates.map((c, i) => {
    const label =
     c.kind === "keep"
      ? `keep ${c.range}`
      : `${c.range}   ${c.kind}${c.isMajor ? "  ⚠ major" : ""}`;
    return (
     <Text key={c.kind} color={i === state.cursor ? "cyan" : undefined}>
      {i === state.cursor ? "❯ " : "  "}
      {label}
     </Text>
    );
   })}
  </Box>
 );
}
```

Create `package/src/cli/ui/run-walk.ts`:

```ts
import { Effect } from "effect";
import { createElement } from "react";
import { render } from "ink";
import { Walk } from "./Walk.js";
import type { Decision, WalkItem } from "../walk-types.js";

/**
 * Render the interactive Walk inside an Effect, resolving with the collected
 * decisions once the user finishes (or immediately when nothing is actionable).
 *
 * @internal
 */
export function runWalk(items: readonly WalkItem[]): Effect.Effect<Decision[], never> {
 return Effect.async<Decision[]>((resume) => {
  let settled = false;
  const finish = (decisions: readonly Decision[]) => {
   if (settled) return;
   settled = true;
   resume(Effect.succeed([...decisions]));
  };
  const instance = render(createElement(Walk, { items, onDone: finish }));
  void instance.waitUntilExit();
 });
}
```

(Note: `Walk.tsx` is a `.tsx` file — confirm the project's tsconfig/Biome handle TSX. If JSX is not configured for this package, use `createElement` calls instead of JSX in `Walk.tsx`, or add the minimal `jsx` compiler option scoped to the CLI. Resolve this during implementation; do not change the runtime engine's tsconfig.)

- [ ] **Step 6: Write the Ink UI test (ink-testing-library)**

Create `package/__test__/cli/walk-ui.test.tsx`:

```tsx
import { render } from "ink-testing-library";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { Walk } from "../../src/cli/ui/Walk.js";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import type { Decision, WalkItem } from "../../src/cli/walk-types.js";

const entry = (pkg: string): CatalogEntry => ({ catalog: "silk", pkg, currentRange: "^5.9.0", operator: "^", rangeSpan: [0, 8] });
const C = (kind: Candidate["kind"], range: string): Candidate => ({ kind, range, version: range.replace(/^[\^~]/, ""), isMajor: kind === "latest" });
const ts: WalkItem = { entry: entry("typescript"), candidates: [C("in-range", "^5.9.3"), C("latest", "^7.1.0"), C("keep", "^5.9.0")], upToDate: false, driftPeer: null };

const tick = () => new Promise((r) => setTimeout(r, 20));

describe("Walk (ink)", () => {
 it("renders the current package and records a choice on enter", async () => {
  let decisions: readonly Decision[] = [];
  const { lastFrame, stdin } = render(createElement(Walk, { items: [ts], onDone: (d) => (decisions = d) }));
  expect(lastFrame()).toContain("typescript");
  expect(lastFrame()).toContain("^5.9.3");
  stdin.write("\r"); // enter → choose highlighted (in-range), finish
  await tick();
  expect(decisions.map((d) => d.chosen.kind)).toEqual(["in-range"]);
 });
});
```

- [ ] **Step 7: Run the UI test**

Run: `pnpm vitest run package/__test__/cli/walk-ui.test.tsx`
Expected: PASS. If `ink-testing-library`'s `stdin.write` timing needs a different settle (the component records on enter via `onDone`), adjust the `tick()` delay or await `instance` appropriately — do not change the reducer contract. If JSX/TSX transforms aren't picked up by the test runner, switch the test to `createElement` (already used) and confirm vitest's esbuild handles `.tsx` (it does by default).

- [ ] **Step 8: Commit**

```bash
git add package/src/cli/walk-reducer.ts package/src/cli/ui/Walk.tsx package/src/cli/ui/run-walk.ts package/__test__/cli/walk-reducer.test.ts package/__test__/cli/walk-ui.test.tsx
git commit -m "feat: add interactive walk reducer, Ink component, and bridge

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 6: Wire the interactive default path into the command

**Files:**

- Modify: `package/src/cli/commands/upgrade.ts`
- Test: `package/__test__/cli/upgrade-interactive.int.test.ts`

**Interfaces:**

- Consumes: everything above (`buildWalkItems`, `runWalk`, `buildEdits`, `renderSummary`, `filterEntriesByCatalog`, `pickConfigCandidate`), and B1's `discoverCatalogEntries`/`RegistryResolver`/`applyEdits`.
- Produces:
  - `function resolveVersions(entries, resolver): Effect.Effect<Map<string, string[]>, never>` — resolve versions per unique pkg, swallowing per-pkg failures to `[]` (mirrors B1 skip behavior). Exported for testing.
  - `function applyDecisions(file: string, source: string, decisions: readonly Decision[]): Effect.Effect<number, UpgradeError>` — build edits, write (unless empty), return the count of changed entries. Exported for testing.
  - Updated `upgradeCommand`: adds `--dry-run` and `--catalog` options; default (no `--yes`) runs the interactive walk; `--dry-run` prints `renderSummary` and writes nothing; `--yes` keeps the B1 path.

- [ ] **Step 1: Write the failing integration test (the interactive core, headless)**

Create `package/__test__/cli/upgrade-interactive.int.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { describe, expect, it, onTestFinished } from "vitest";
import { applyDecisions, resolveVersions } from "../../src/cli/commands/upgrade.js";
import { discoverCatalogEntries } from "../../src/cli/discover.js";
import { buildWalkItems } from "../../src/cli/walk-plan.js";
import type { Decision } from "../../src/cli/walk-types.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  typescript: "^5.9.0",
  vitest: { range: "^4.0.0", peer: "^4.0.0", strategy: "lock-minor" },
 } } },
});
`;

const resolver = {
 versions: (pkg: string) =>
  Effect.succeed(pkg === "typescript" ? ["5.9.0", "5.9.3", "7.1.0"] : ["4.0.0", "4.2.3"]),
};

describe("interactive apply (headless)", () => {
 it("applies chosen decisions to the file, range + recomputed peer", async () => {
  const file = writeTmpConfig(SOURCE);
  onTestFinished(() => {
   // cleanup handled by tmp-config util if it registers; otherwise best-effort
  });
  const result = await Effect.runPromise(
   Effect.gen(function* () {
    const source = readFileSync(file, "utf8");
    const { entries } = discoverCatalogEntries(source, file);
    const versions = yield* resolveVersions(entries, resolver);
    const items = yield* buildWalkItems(entries, versions);
    // Simulate: choose the in-range candidate for every actionable item.
    const decisions: Decision[] = items
     .filter((i) => !i.upToDate)
     .map((i) => ({ item: i, chosen: i.candidates.find((c) => c.kind === "in-range")! }));
    return yield* applyDecisions(file, source, decisions);
   }),
  );
  const out = readFileSync(file, "utf8");
  expect(out).toContain('typescript: "^5.9.3"');
  expect(out).toContain('range: "^4.2.3"');
  expect(out).toContain('peer: "^4.2.0"');
  expect(result).toBe(2);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/upgrade-interactive.int.test.ts`
Expected: FAIL — `resolveVersions`/`applyDecisions` not exported.

- [ ] **Step 3: Add `resolveVersions` and `applyDecisions` to `commands/upgrade.ts`**

Add these exported helpers (place near `runUpgrade`; reuse existing imports, adding `buildEdits`, `Decision`, `CatalogEntry`):

```ts
/** Resolve published versions per unique package, swallowing per-package failures to []. */
export function resolveVersions(
 entries: readonly CatalogEntry[],
 resolver: Resolver,
): Effect.Effect<Map<string, string[]>, never> {
 return Effect.gen(function* () {
  const out = new Map<string, string[]>();
  for (const pkg of new Set(entries.map((e) => e.pkg))) {
   const vr = yield* resolver.versions(pkg).pipe(Effect.either);
   out.set(pkg, vr._tag === "Right" ? vr.right : []);
  }
  return out;
 });
}

/** Apply decisions to the file, returning the number of changed entries. */
export function applyDecisions(
 file: string,
 source: string,
 decisions: readonly Decision[],
): Effect.Effect<number, UpgradeError> {
 return Effect.gen(function* () {
  const edits = buildEdits(decisions);
  if (edits.length > 0) {
   const next = applyEdits(source, edits);
   yield* Effect.try({
    try: () => writeFileSync(file, next, "utf8"),
    catch: () => new UpgradeError({ message: `Cannot write ${file}` }),
   });
  }
  const changed = new Set(edits.map((e) => e.span[0]));
  return decisions.filter((d) => changed.has(d.item.entry.rangeSpan[0])).length;
 });
}
```

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/upgrade-interactive.int.test.ts`
Expected: PASS — file rewritten to `^5.9.3` and `^4.2.3`/peer `^4.2.0`, result `2`.

- [ ] **Step 5: Wire the command options and default path**

Update `upgradeCommand` in `commands/upgrade.ts` to add `--dry-run` and `--catalog`, and branch: `--yes` → existing B1 `runUpgrade`; otherwise interactive. Add imports for `Options`, `runWalk`, `buildWalkItems`, `renderSummary`, `filterEntriesByCatalog`, `discoverCatalogEntries`, `readFileSync`. Replace the command definition:

```ts
const dryRunFlag = Options.boolean("dry-run").pipe(Options.withDefault(false));
const catalogOption = Options.text("catalog").pipe(Options.optional);

export const upgradeCommand = Command.make(
 "upgrade",
 { file: fileArg, yes: yesFlag, dryRun: dryRunFlag, catalog: catalogOption },
 ({ file, yes, dryRun, catalog }) =>
  Effect.gen(function* () {
   const resolver = yield* RegistryResolver;
   if (yes) {
    const result = yield* runUpgrade({ file, resolver });
    yield* Effect.sync(() =>
     process.stdout.write(`Updated ${result.updated} package(s); skipped ${result.skipped.length}.\n`),
    );
    return;
   }
   const source = yield* Effect.try({
    try: () => readFileSync(file, "utf8"),
    catch: () => new UpgradeError({ message: `Cannot read ${file}` }),
   });
   const discovered = yield* Effect.try({
    try: () => discoverCatalogEntries(source, file),
    catch: (e) => new UpgradeError({ message: String(e) }),
   });
   const catalogName = catalog._tag === "Some" ? catalog.value : undefined;
   const entries = filterEntriesByCatalog(discovered.entries, catalogName);
   const versions = yield* resolveVersions(entries, resolver);
   const items = yield* buildWalkItems(entries, versions).pipe(
    Effect.catchAll((e) => Effect.fail(new UpgradeError({ message: e.message }))),
   );
   // --dry-run mirrors --yes (in-range only, never a major); the walk is interactive.
   const decisions = dryRun
    ? items
      .map((i) => ({ item: i, chosen: i.candidates.find((c) => c.kind === "in-range") }))
      .filter((d): d is Decision => d.chosen !== undefined)
    : yield* runWalk(items);
   yield* Effect.sync(() => process.stdout.write(`${renderSummary(decisions)}\n`));
   if (dryRun) return;
   const changed = yield* applyDecisions(file, source, decisions);
   yield* Effect.sync(() => process.stdout.write(`Applied ${changed} change(s).\n`));
  }).pipe(Effect.provide(RegistryResolverLive), Effect.provide(NodeContext.layer)),
).pipe(Command.withDescription("Upgrade catalog versions in a config file"));
```

(Confirm the installed `@effect/cli` `Options.optional` / `Options.text` shape — adapt the `catalog._tag === "Some"` unwrap if the version returns a different Option surface. Behavior unchanged.)

- [ ] **Step 6: Typecheck, full suite, coverage**

Run: `pnpm run typecheck`
Expected: PASS.

Run: `pnpm run test`
Expected: PASS. If the v8 coverage gate fails because of the Ink shell / command wiring, lower the thresholds in `vitest.config.ts` to the floor of achieved coverage (spread `AgentPlugin.COVERAGE_LEVELS.basic.thresholds`, lower only the breached metrics) and re-run. If coverage passes, do not touch the config.

Run: `pnpm run build`
Expected: PASS (the `.tsx`/ink imports build; if the bundler needs a jsx setting for the CLI, configure it minimally without touching the runtime engine).

- [ ] **Step 7: Commit**

```bash
git add package/src/cli/commands/upgrade.ts package/__test__/cli/upgrade-interactive.int.test.ts vitest.config.ts
git commit -m "feat: wire interactive upgrade walk, dry-run, and catalog filter

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

## Self-Review

**Spec coverage (Phase B interactive portions):**

- Interactive walk, one package at a time, in-range/latest/keep → Tasks 2, 5. ✓
- Major candidate offered interactively only; `--yes` never majors → Task 6 (default vs `--yes` branch), reusing B1's in-range-only `runUpgrade`. ✓
- Up-to-date packages dimmed/auto-skipped → reducer `initWalk`/`nextActionable` (Task 5); `upToDate` flag (Task 2). ✓
- Peer recompute on chosen upgrade + drift resync of existing peer → `buildEdits` (Task 3), `detectPeerDrift` (Task 1). ✓
- Footer tally + confirmation diff before write → `renderSummary` (Task 3); shown in Task 6 even when applying. ✓
- `--dry-run` prints diff, writes nothing → Task 6. ✓
- `--catalog` filter → `filterEntriesByCatalog` (Task 4) + Task 6. ✓
- Config-file autodetect → `pickConfigCandidate` (Task 4). (The cwd-scan that feeds it is wired in Task 6's command if a path is omitted; `Args.file` currently requires a path — if autodetect-on-omit is desired, make the file arg optional and scan cwd, surfacing `pickConfigCandidate`'s error. This is the one place to confirm the desired UX during implementation.)

**Out of scope (explicit):** materializing a NEW `peer` literal when a package has `strategy` but no `peer` — requires AST insertion (capturing the package-object's insertion point in `discover`), not span replacement. Deferred; everything else handles existing literals. If pulled in later, it extends `discover` (capture an insertion offset) and `buildEdits` (emit an insert, not a replace).

**Placeholder scan:** no TBD/TODO; every code step has complete code. Two UX confirmations are flagged inline (autodetect-on-omit wiring; `Options.optional` unwrap) — both are "confirm the installed API and pick the obvious behavior," not missing logic.

**Type consistency:** `WalkItem`/`Decision` (Task 2) flow through `walk-reducer` (5), `edits`/`summary` (3), and the command (6) with identical shapes. `buildWalkItems` consumes a `ReadonlyMap<string, readonly string[]>` produced by `resolveVersions` (6). `runWalk` returns `Decision[]` consumed by `applyDecisions`/`renderSummary` (6). The reducer's `walkStep` key union (`"up" | "down" | "enter"`) is mapped from Ink's `key.upArrow/downArrow/return` in `Walk.tsx` (5).

**External-API risks (flagged for execution):** (1) Ink `useInput`/`render`/`waitUntilExit` and `ink-testing-library` `stdin.write`/`lastFrame` surfaces (Task 5); (2) `.tsx`/JSX handling in the package's tsconfig, Biome, vitest, and the bundler (Task 5/6) — fall back to `createElement` (already used in the bridge and tests) if JSX config is absent; (3) `@effect/cli` `Options.optional`/`Options.text` Option unwrap (Task 6). Each is called out at its step; none change the tested logic.
