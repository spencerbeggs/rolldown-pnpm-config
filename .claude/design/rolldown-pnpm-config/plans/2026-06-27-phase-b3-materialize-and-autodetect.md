# Phase B3 — Peer Materialization + Config Autodetect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two deferred B2 follow-ups: (1) materialize a NEW `peer` literal when a package declares `strategy` but has no `peer`; (2) autodetect the config file when no path is passed.

**Architecture:** Materialization reuses the existing span machinery — the insertion point is the end of the range literal (`rangeSpan[1]`), and `applyEdits` already supports zero-width (insert) spans, so NO `discover` change is needed. A `materializePeer` field (computed in `walk-plan`, like `driftPeer`) flows through `buildEdits`/`renderSummary`; the `--yes` path inserts inline. Autodetect makes the file arg optional and, when omitted, scans cwd for `*.ts` files that contain a `PnpmConfigPlugin(...)` call (via the existing `discover`), feeding the existing `pickConfigCandidate`.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, `@effect/cli`, `oxc-parser`, `semver-effect`, `ink`, Vitest, Biome.

## Global Constraints

- Relative imports MUST use `.js` extensions; Node built-ins MUST use `node:` protocol; type-only imports MUST use `import type`. No import cycles. Tests under `package/__test__/cli/`.
- `exactOptionalPropertyTypes` is ON: never pass `undefined` explicitly to an optional property — omit it. Run the FULL `pnpm run typecheck` (tsgo) for verification; the test suite alone does NOT catch exactOptionalPropertyTypes violations (build:dev transpiles without them).
- The project enforces `useImportType` in SEPARATE-import mode: keep `import type { X }` and `import { y }` as two statements; do NOT merge into `import { y, type X }` (that errors here).
- Materialization only applies to object-form specs that have `strategy` but no `peer` (a bare-string spec can carry neither). The new peer literal is inserted at `rangeSpan[1]` as `, peer: "<derived>"`, relying on the existing comma after the range property to separate it from the next property.
- The runtime engine (`package/src/catalogs.ts`, `freeze.ts`, `strategies/`, descriptors) is NOT modified. CLI code lives only under `package/src/cli/`.
- Coverage: keep the pure units tested; if the full-suite coverage gate fails, lower thresholds in `vitest.config.ts` to the floor of achieved coverage (only if it actually fails).
- Commits require conventional-commit format + DCO signoff: `Signed-off-by: C. Spencer Beggs <spencer@beg.gs>`. Commit bodies must NOT contain markdown inline code (backticks) — the `silk/body-no-markdown` commitlint rule rejects them.
- Run a single test file with: `pnpm vitest run <path>`.

## Reused interfaces (do not redefine)

- `CatalogEntry { catalog, pkg, currentRange, operator, rangeSpan: [number,number], peer?: { value, span }, strategy? }`.
- `Candidate { kind: "in-range"|"latest"|"keep", range, version, isMajor, peerRange? }` — `peerRange` is present on non-keep candidates whenever the entry has a `strategy` (planEntry computes it from `entry.strategy`, regardless of whether `peer` exists).
- `WalkItem { entry, candidates, upToDate, driftPeer }` (adding `materializePeer` in Task 1); `Decision { item, chosen }`.
- `Edit { span: [number,number], text }`; `applyEdits(source, edits)` (a zero-width span `[n, n]` inserts `text` at `n`).
- `derivePeerRange(range, strategy): Effect<string, PeerRangeError>`; `detectPeerDrift(entry)`; `planEntry`; `discoverCatalogEntries`; `pickConfigCandidate(matches)`.

---

### Task 1: Materialize a new peer literal for strategy-without-peer packages

**Files:**

- Modify: `package/src/cli/walk-types.ts` (add `materializePeer` to `WalkItem`)
- Modify: `package/src/cli/walk-plan.ts` (compute `materializePeer`, update `upToDate`)
- Modify: `package/src/cli/edits.ts` (insert branch)
- Modify: `package/src/cli/summary.ts` (materialize line + tally)
- Modify: `package/src/cli/commands/upgrade.ts` (`runUpgrade` --yes inline insert)
- Test: `package/__test__/cli/edits.test.ts`, `summary.test.ts`, `walk-plan.test.ts` (extend), `upgrade-interactive.int.test.ts` (extend)

**Interfaces:**

- Produces: `WalkItem.materializePeer: string | null` — the peer range to insert when the entry has `strategy` but no `peer` (derived from the current range), else `null`.

- [ ] **Step 1: Extend the failing edits test**

In `package/__test__/cli/edits.test.ts`, add cases. The `item` helper already accepts `WalkItem` overrides; the `entry` helper accepts `CatalogEntry` overrides. Add:

```ts
it("inserts a new peer literal on upgrade when strategy is set but no peer exists", () => {
 const e = entry({ rangeSpan: [10, 18], strategy: "lock-minor" }); // no peer
 const d: Decision = { item: item(e), chosen: cand({ range: "^1.2.0", peerRange: "^1.2.0" }) };
 expect(buildEdits([d])).toEqual([
  { span: [10, 18], text: '"^1.2.0"' },
  { span: [18, 18], text: ', peer: "^1.2.0"' },
 ]);
});

it("inserts a new peer literal on keep via materializePeer when strategy is set but no peer exists", () => {
 const e = entry({ rangeSpan: [10, 18], strategy: "lock-minor" }); // no peer
 const d: Decision = { item: item(e, { materializePeer: "^1.0.0" }), chosen: cand({ kind: "keep", range: "^1.0.0" }) };
 expect(buildEdits([d])).toEqual([{ span: [18, 18], text: ', peer: "^1.0.0"' }]);
});
```

The existing `item` helper must default `materializePeer: null` — update its default override object to include `materializePeer: null` so existing cases keep passing.

- [ ] **Step 2: Run edits test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/edits.test.ts`
Expected: FAIL — `materializePeer` not on `WalkItem` (type error) and the insert branch missing.

- [ ] **Step 3: Add `materializePeer` to `WalkItem`**

In `package/src/cli/walk-types.ts`, add to the `WalkItem` interface (after `driftPeer`):

```ts
 /** A peer range to MATERIALIZE (insert) when strategy is set but no peer literal exists, else null. */
 readonly materializePeer: string | null;
```

- [ ] **Step 4: Implement the insert branch in `edits.ts`**

Replace the body of `buildEdits` in `package/src/cli/edits.ts`:

```ts
export function buildEdits(decisions: readonly Decision[]): Edit[] {
 const edits: Edit[] = [];
 for (const { item, chosen } of decisions) {
  const { entry } = item;
  const insertAt = entry.rangeSpan[1];
  if (chosen.kind !== "keep") {
   edits.push({ span: entry.rangeSpan, text: JSON.stringify(chosen.range) });
   if (entry.peer && chosen.peerRange) {
    edits.push({ span: entry.peer.span, text: JSON.stringify(chosen.peerRange) });
   } else if (!entry.peer && entry.strategy && chosen.peerRange) {
    edits.push({ span: [insertAt, insertAt], text: `, peer: ${JSON.stringify(chosen.peerRange)}` });
   }
  } else if (entry.peer && item.driftPeer) {
   edits.push({ span: entry.peer.span, text: JSON.stringify(item.driftPeer) });
  } else if (!entry.peer && item.materializePeer) {
   edits.push({ span: [insertAt, insertAt], text: `, peer: ${JSON.stringify(item.materializePeer)}` });
  }
 }
 return edits;
}
```

- [ ] **Step 5: Run edits test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/edits.test.ts`
Expected: PASS (all prior + 2 new).

- [ ] **Step 6: Compute `materializePeer` in `walk-plan.ts` (test first)**

In `package/__test__/cli/walk-plan.test.ts`, add a case (and ensure the helper-built items still typecheck with the new field):

```ts
it("computes materializePeer and marks the item actionable for strategy-without-peer", async () => {
 const items = await run(
  [entry({ pkg: "ts", currentRange: "^5.9.0", rangeSpan: [0, 8], strategy: "lock-minor" })], // no peer
  { ts: ["5.9.0"] }, // already newest → only keep candidate
 );
 const it0 = items[0];
 expect(it0.materializePeer).toBe("^5.9.0"); // lock-minor of 5.9.0
 expect(it0.upToDate).toBe(false); // actionable because there is a peer to materialize
});
```

Then update `package/src/cli/walk-plan.ts`:

```ts
import { Effect } from "effect";
import { detectPeerDrift } from "./drift.js";
import { derivePeerRange } from "./peer-range.js";
import type { PeerRangeError } from "./peer-range.js";
import { planEntry } from "./plan.js";
import type { CatalogEntry } from "./types.js";
import type { WalkItem } from "./walk-types.js";

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
   const materializePeer =
    entry.strategy && !entry.peer ? yield* derivePeerRange(entry.currentRange, entry.strategy) : null;
   const upToDate = candidates.length === 1 && driftPeer === null && materializePeer === null;
   items.push({ entry, candidates, upToDate, driftPeer, materializePeer });
  }
  return items;
 });
}
```

- [ ] **Step 7: Run walk-plan test**

Run: `pnpm vitest run package/__test__/cli/walk-plan.test.ts`
Expected: PASS (prior + new). If a prior test constructed a `WalkItem` literal without `materializePeer`, add `materializePeer: null` to it.

- [ ] **Step 8: Count materialization in `summary.ts` (test first)**

In `package/__test__/cli/summary.test.ts`, add:

```ts
it("reports a materialized peer on keep when strategy-without-peer", () => {
 const e = entry({ strategy: "lock-minor" }); // no peer
 const d: Decision = { item: item(e, { materializePeer: "^5.9.0" }), chosen: cand({ kind: "keep", range: "^5.9.0" }) };
 const out = renderSummary([d]);
 expect(out).toContain("new peer");
 expect(out).toContain("^5.9.0");
 expect(out).toContain("1 new peer");
});
```

(Ensure the `item` helper in this test defaults `materializePeer: null`.)

Then update `package/src/cli/summary.ts`: add a `materialize` counter and a body line, and extend the footer. Replace the loop + footer:

```ts
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
   lines.push(`  ${entry.catalog} › ${entry.pkg}  ${entry.currentRange} → ${chosen.range}`);
   if (entry.peer && chosen.peerRange && chosen.peerRange !== entry.peer.value) {
    lines.push(`    ↳ peer  ${entry.peer.value} → ${chosen.peerRange}`);
   } else if (!entry.peer && entry.strategy && chosen.peerRange) {
    lines.push(`    ↳ peer (new)  → ${chosen.peerRange}`);
    materialize++;
   }
  } else if (entry.peer && item.driftPeer) {
   resync++;
   lines.push(`  ${entry.catalog} › ${entry.pkg}  (resync peer)`);
   lines.push(`    ↳ peer  ${entry.peer.value} → ${item.driftPeer}`);
  } else if (!entry.peer && item.materializePeer) {
   materialize++;
   lines.push(`  ${entry.catalog} › ${entry.pkg}  (materialize peer)`);
   lines.push(`    ↳ peer (new)  → ${item.materializePeer}`);
  } else {
   upToDate++;
  }
 }
 lines.push(`${toUpdate} to update · ${major} major · ${resync} resync · ${materialize} new peer · ${upToDate} up to date`);
```

- [ ] **Step 9: Run summary test**

Run: `pnpm vitest run package/__test__/cli/summary.test.ts`
Expected: PASS.

- [ ] **Step 10: Materialize in the `--yes` path (`runUpgrade`) + int test**

In `package/__test__/cli/upgrade-interactive.int.test.ts`, add an int test driving the headless apply for a strategy-without-peer package that gets upgraded, asserting a new peer literal appears:

```ts
it("materializes a new peer literal when strategy is set but no peer exists", async () => {
 const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  typescript: { range: "^5.9.0", strategy: "lock-minor" },
 } } },
});
`;
 const file = writeTmpConfig(SOURCE);
 const resolver = { versions: () => Effect.succeed(["5.9.0", "5.9.3"]) };
 const out = await Effect.runPromise(
  Effect.gen(function* () {
   const source = readFileSync(file, "utf8");
   const { entries } = discoverCatalogEntries(source, file);
   const versions = yield* resolveVersions(entries, resolver);
   const items = yield* buildWalkItems(entries, versions);
   const decisions: Decision[] = items
    .filter((i) => !i.upToDate)
    .map((i) => ({ item: i, chosen: i.candidates.find((c) => c.kind === "in-range") ?? i.candidates[0] }));
   return yield* applyDecisions(file, source, decisions);
  }),
 );
 const result = readFileSync(file, "utf8");
 expect(result).toContain('range: "^5.9.3"');
 expect(result).toContain('peer: "^5.9.0"'); // lock-minor of 5.9.3 → ^5.9.0
 expect(out).toBeGreaterThanOrEqual(1);
});
```

Then update the `runUpgrade` edit loop in `package/src/cli/commands/upgrade.ts` so the `--yes` path also materializes. Replace the peer-edit block inside the loop:

```ts
   edits.push({ span: entry.rangeSpan, text: JSON.stringify(inRange.range) });
   if (entry.peer && inRange.peerRange) {
    edits.push({ span: entry.peer.span, text: JSON.stringify(inRange.peerRange) });
   } else if (!entry.peer && entry.strategy && inRange.peerRange) {
    const at = entry.rangeSpan[1];
    edits.push({ span: [at, at], text: `, peer: ${JSON.stringify(inRange.peerRange)}` });
   }
```

Also confirm `applyDecisions`'s change-count (from B2) counts a keep+materialize decision: it counts `d.chosen.kind !== "keep" || (d.item.entry.peer !== undefined && d.item.driftPeer !== null)`. Extend that predicate to also count materialization:

```ts
  const changedCount = decisions.filter(
   (d) =>
    d.chosen.kind !== "keep" ||
    (d.item.entry.peer !== undefined && d.item.driftPeer !== null) ||
    (d.item.entry.peer === undefined && d.item.materializePeer !== null),
  ).length;
```

- [ ] **Step 11: Full verification**

Run: `pnpm vitest run package/__test__/cli/upgrade-interactive.int.test.ts`
Expected: PASS (the new materialize int test inserts the peer literal).

Run: `pnpm run typecheck`
Expected: PASS (full tsgo, exactOptionalPropertyTypes).

Run: `pnpm run test`
Expected: PASS (full suite). If coverage fails, lower thresholds per the plan; otherwise leave config untouched.

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add package/src/cli/walk-types.ts package/src/cli/walk-plan.ts package/src/cli/edits.ts package/src/cli/summary.ts package/src/cli/commands/upgrade.ts package/__test__/cli/edits.test.ts package/__test__/cli/summary.test.ts package/__test__/cli/walk-plan.test.ts package/__test__/cli/upgrade-interactive.int.test.ts
git commit -m "feat: materialize a new peer literal for strategy-without-peer packages

When a catalog package declares a strategy but no peer, the upgrade now
inserts a derived peer literal at the end of the range property, in both
the interactive walk and the non-interactive path, with the summary and
change count reflecting the materialization.

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

### Task 2: Config-file autodetect when no path is passed

**Files:**

- Modify: `package/src/cli/select-file.ts` (add `findConfigFiles` Effect)
- Modify: `package/src/cli/commands/upgrade.ts` (optional file arg + autodetect resolution)
- Test: `package/__test__/cli/select-file.test.ts` (extend for `findConfigFiles`)
- Test: `package/__test__/cli/upgrade-interactive.int.test.ts` (autodetect int case)

**Interfaces:**

- Consumes: `pickConfigCandidate` (existing), `discoverCatalogEntries` (existing).
- Produces: `function findConfigFiles(dir: string): Effect.Effect<string[], never>` — list `*.ts` files directly in `dir`, read each, run `discoverCatalogEntries`, and return the paths whose discovery yields at least one entry (i.e. contain a usable `PnpmConfigPlugin(...)` catalog). Read/parse failures are skipped, never thrown.

- [ ] **Step 1: Write the failing `findConfigFiles` test**

In `package/__test__/cli/select-file.test.ts`, add (using node:fs to build a temp dir):

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { findConfigFiles } from "../../src/cli/select-file.js";

const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ catalogs: { silk: { packages: { typescript: "^5.9.0" } } } });
`;

describe("findConfigFiles", () => {
 it("returns only .ts files that contain a PnpmConfigPlugin catalog", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rpc-detect-"));
  writeFileSync(join(dir, "config.ts"), CONFIG, "utf8");
  writeFileSync(join(dir, "other.ts"), "export const x = 1;\n", "utf8");
  writeFileSync(join(dir, "notes.md"), "ignore me\n", "utf8");
  const matches = await Effect.runPromise(findConfigFiles(dir));
  expect(matches.map((m) => m.endsWith("config.ts"))).toEqual([true]);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/cli/select-file.test.ts`
Expected: FAIL — `findConfigFiles` not exported.

- [ ] **Step 3: Implement `findConfigFiles` in `select-file.ts`**

Add to `package/src/cli/select-file.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { discoverCatalogEntries } from "./discover.js";

/**
 * Scan a directory for top-level `.ts` files whose source contains a usable
 * `PnpmConfigPlugin(...)` catalog (discovery yields at least one entry). Read
 * or parse failures are skipped silently. Returns absolute-or-joined paths.
 *
 * @internal
 */
export function findConfigFiles(dir: string): Effect.Effect<string[], never> {
 return Effect.sync(() => {
  let names: string[];
  try {
   names = readdirSync(dir);
  } catch {
   return [];
  }
  const matches: string[] = [];
  for (const name of names) {
   if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue;
   const path = join(dir, name);
   try {
    const source = readFileSync(path, "utf8");
    const { entries } = discoverCatalogEntries(source, path);
    if (entries.length > 0) matches.push(path);
   } catch {
    // unreadable or unparseable — skip
   }
  }
  return matches;
 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/cli/select-file.test.ts`
Expected: PASS.

- [ ] **Step 5: Make the file arg optional and resolve via autodetect**

In `package/src/cli/commands/upgrade.ts`, make the file argument optional and resolve it. Change the arg definition:

```ts
const fileArg = Args.file({ name: "file", exists: "yes" }).pipe(Args.optional);
```

Add a resolver helper (near the other exported helpers), using `pickConfigCandidate` + `findConfigFiles`:

```ts
import { findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { Option } from "effect";

/** Resolve the target file: the passed path, or autodetect in cwd. */
export function resolveTargetFile(fileOpt: Option.Option<string>): Effect.Effect<string, UpgradeError> {
 return Effect.gen(function* () {
  const explicit = Option.getOrUndefined(fileOpt);
  if (explicit !== undefined) return explicit;
  const matches = yield* findConfigFiles(process.cwd());
  const picked = pickConfigCandidate(matches);
  if (!picked.ok) return yield* Effect.fail(new UpgradeError({ message: picked.message }));
  return picked.file;
 });
}
```

Then in the `upgradeCommand` handler, replace each direct use of `file` with a resolved path: at the top of the handler, `const file = yield* resolveTargetFile(fileOpt);` (rename the destructured arg to `fileOpt`). The rest of the handler (both `--yes` and interactive branches) uses the resolved `file` unchanged.

(Confirm the installed `@effect/cli` `Args.optional` yields an `Option<string>` in the handler args; adapt the `Option.getOrUndefined` unwrap if the surface differs. Behavior unchanged.)

- [ ] **Step 6: Add an autodetect int test**

In `package/__test__/cli/upgrade-interactive.int.test.ts`, add a focused test for `resolveTargetFile` (it is exported):

```ts
it("autodetects the single config file when no path is given", async () => {
 const dir = mkdtempSync(join(tmpdir(), "rpc-auto-"));
 writeFileSync(join(dir, "savvy.build.ts"), `import { PnpmConfigPlugin } from "rolldown-pnpm-config";\nexport const p = PnpmConfigPlugin({ catalogs: { silk: { packages: { typescript: "^5.9.0" } } } });\n`, "utf8");
 const prev = process.cwd();
 try {
  process.chdir(dir);
  const file = await Effect.runPromise(resolveTargetFile(Option.none()));
  expect(file.endsWith("savvy.build.ts")).toBe(true);
 } finally {
  process.chdir(prev);
 }
});
```

(Add the needed imports: `mkdtempSync`/`writeFileSync` from node:fs, `tmpdir` from node:os, `join` from node:path, `Option` from effect, and `resolveTargetFile` from the command module.)

- [ ] **Step 7: Full verification**

Run: `pnpm vitest run package/__test__/cli/upgrade-interactive.int.test.ts package/__test__/cli/select-file.test.ts`
Expected: PASS.

Run: `pnpm run typecheck` — PASS (full tsgo).
Run: `pnpm run test` — full suite PASS (lower coverage thresholds only if it actually fails).
Run: `pnpm run build` — PASS.

- [ ] **Step 8: Commit**

```bash
git add package/src/cli/select-file.ts package/src/cli/commands/upgrade.ts package/__test__/cli/select-file.test.ts package/__test__/cli/upgrade-interactive.int.test.ts
git commit -m "feat: autodetect the config file when no path is passed

When the file argument is omitted, the upgrade command scans the working
directory for a single .ts file containing a PnpmConfigPlugin catalog and
uses it, erroring clearly on zero or multiple candidates.

Signed-off-by: C. Spencer Beggs <spencer@beg.gs>"
```

---

## Self-Review

**Spec coverage:**

- Materialize a new peer literal when strategy-but-no-peer (interactive walk, dry-run via buildEdits, and `--yes` via runUpgrade) → Task 1. ✓
- Config-file autodetect (the deferred half of `select-file`) → Task 2. ✓

**Out of scope (unchanged):** none remaining from the original spec beyond these two; after B3 the spec's CLI surface is fully implemented.

**Placeholder scan:** no TBD/TODO; every code step has complete code.

**Type consistency:** `WalkItem.materializePeer: string | null` (Task 1) is read by `buildEdits` and `renderSummary` (Task 1) and set by `buildWalkItems` (Task 1). `resolveTargetFile(Option<string>)` and `findConfigFiles(string)` (Task 2) compose with the existing `pickConfigCandidate`. The insert edit uses `[rangeSpan[1], rangeSpan[1]]` (zero-width) which `applyEdits` already supports; the overlap check (`cur.span[1] > prev.span[0]`) does not false-trigger against the adjacent range replace `[start, rangeSpan[1]]` because the insert's end equals the range edit's end (not strictly greater than its start).

**Verification discipline:** every task runs the FULL `pnpm run typecheck` (not just the suite) because exactOptionalPropertyTypes violations slip past build:dev — a lesson from B2.
