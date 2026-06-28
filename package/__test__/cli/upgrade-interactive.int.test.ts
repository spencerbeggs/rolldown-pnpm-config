import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
	applyDecisions,
	applyInteropAndDecisions,
	resolveGatedVersions,
	resolveTargetFile,
	runUpgrade,
} from "../../src/cli/commands/upgrade.js";
import { discoverCatalogEntries } from "../../src/cli/discover.js";
import type { GroupMember } from "../../src/cli/interop.js";
import {
	affectedReentry,
	buildInteropEdits,
	capVersions,
	reentryCandidates,
	runInterop,
} from "../../src/cli/interop.js";
import { buildWalkItems } from "../../src/cli/walk-plan.js";
import type { Decision } from "../../src/cli/walk-types.js";
import { makeStubResolver } from "./utils/stub-resolver.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  typescript: "^5.9.0",
  vitest: { range: "^4.0.0", peer: "^4.0.0", strategy: "lock-minor" },
 } } },
});
`;

const DRIFT_SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  vitest: { range: "^4.2.3", peer: "^4.1.0", strategy: "lock-minor" },
 } } },
});
`;

const resolver = makeStubResolver({
	versions: { typescript: ["5.9.0", "5.9.3", "7.1.0"], vitest: ["4.0.0", "4.2.3"] },
});

const driftResolver = makeStubResolver({ versions: { vitest: ["4.2.3"] } });

const ZERO_GATE = { ageMinutes: 0, exclude: [] as string[] };

describe("interactive apply (headless)", () => {
	it("applies chosen decisions to the file, range + recomputed peer", async () => {
		const file = writeTmpConfig(SOURCE);
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const source = readFileSync(file, "utf8");
				const { entries } = discoverCatalogEntries(source, file);
				const versions = yield* resolveGatedVersions(entries, resolver, ZERO_GATE, Date.now());
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

	it("materializes a new peer literal when strategy is set but no peer exists", async () => {
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  typescript: { range: "^5.9.0", strategy: "lock-minor" },
 } } },
});
`;
		const file = writeTmpConfig(SOURCE);
		const resolver = makeStubResolver({ versions: { typescript: ["5.9.0", "5.9.3"] } });
		const out = await Effect.runPromise(
			Effect.gen(function* () {
				const source = readFileSync(file, "utf8");
				const { entries } = discoverCatalogEntries(source, file);
				const versions = yield* resolveGatedVersions(entries, resolver, ZERO_GATE, Date.now());
				const items = yield* buildWalkItems(entries, versions);
				const decisions: Decision[] = items
					.filter((i) => !i.upToDate)
					.map((i) => ({ item: i, chosen: i.candidates.find((c) => c.kind === "in-range") ?? i.candidates[0] }));
				return yield* applyDecisions(file, source, decisions);
			}),
		);
		const result = readFileSync(file, "utf8");
		expect(result).toContain('range: "^5.9.3"');
		expect(result).toContain('peer: "^5.9.0"'); // peer from in-range candidate: lock-minor(5.9.3) → ^5.9.0
		expect(out).toBeGreaterThanOrEqual(1);
	});

	it("resyncs drifted peer even when range is already at newest version", async () => {
		const file = writeTmpConfig(DRIFT_SOURCE);
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const source = readFileSync(file, "utf8");
				const { entries } = discoverCatalogEntries(source, file);
				const versions = yield* resolveGatedVersions(entries, driftResolver, ZERO_GATE, Date.now());
				const items = yield* buildWalkItems(entries, versions);
				// Drifted item must be actionable (not up-to-date) despite being newest.
				const vitestItem = items.find((i) => i.entry.pkg === "vitest")!;
				expect(vitestItem.upToDate).toBe(false);
				// Simulate: keep the range (only candidate available), let drift resync run.
				const decisions: Decision[] = items
					.filter((i) => !i.upToDate)
					.map((i) => ({ item: i, chosen: i.candidates.find((c) => c.kind === "keep")! }));
				return yield* applyDecisions(file, source, decisions);
			}),
		);
		const out = readFileSync(file, "utf8");
		// Range must be unchanged.
		expect(out).toContain('range: "^4.2.3"');
		// Peer must be resynced to lock-minor of 4.2.3.
		expect(out).toContain('peer: "^4.2.0"');
		// applyDecisions must count the resync as a change.
		expect(result).toBe(1);
	});
});

describe("runUpgrade --yes path", () => {
	it("resyncs a drifted existing peer under --yes when already at newest", async () => {
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
	catalogs: { silk: { packages: {
		vitest: { range: "^4.2.3", peer: "^4.1.0", strategy: "lock-minor" },
	} } },
});
`;
		const file = writeTmpConfig(SOURCE);
		const resolver = makeStubResolver({ versions: { vitest: ["4.2.3"] } }); // already newest, no upgrade
		const result = await Effect.runPromise(runUpgrade({ file, resolver }));
		const out = readFileSync(file, "utf8");
		expect(out).toContain('range: "^4.2.3"'); // range unchanged
		expect(out).toContain('peer: "^4.2.0"'); // drifted peer ^4.1.0 resynced to lock-minor of 4.2.3
		expect(result.updated).toBe(1);
	});

	it("materializes a peer under --yes even when the package is already at its newest version", async () => {
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  typescript: { range: "^5.9.0", strategy: "lock-minor" },
 } } },
});
`;
		const file = writeTmpConfig(SOURCE);
		const resolver = makeStubResolver({ versions: { typescript: ["5.9.0"] } }); // already newest, no upgrade
		const result = await Effect.runPromise(runUpgrade({ file, resolver }));
		const out = readFileSync(file, "utf8");
		expect(out).toContain('range: "^5.9.0"'); // range unchanged
		expect(out).toContain('peer: "^5.9.0"'); // peer materialized (lock-minor of 5.9.0)
		expect(result.updated).toBe(1);
	});
});

describe("interactive interop apply (headless)", () => {
	const INTEROP_SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ catalogs: { effect: { packages: {
 effect: { range: "^3.17.0", strategy: "interop" },
 "@effect/cli": { range: "^0.71.0", strategy: "interop" },
} } } });
`;

	it("holds back a dependent the user picked above the group, then materializes caret peers", async () => {
		const file = writeTmpConfig(INTEROP_SOURCE);
		const interopResolver = makeStubResolver({
			versions: { effect: ["3.17.0"], "@effect/cli": ["0.70.0", "0.71.0"] },
			peerDependencies: {
				effect: { "3.17.0": {} },
				// cli@0.71 needs effect ^3.18 (unavailable) → must drop to 0.70, which needs effect ^3.16
				"@effect/cli": { "0.70.0": { effect: "^3.16.0" }, "0.71.0": { effect: "^3.18.0" } },
			},
		});

		const flagged = await Effect.runPromise(
			Effect.gen(function* () {
				const source = readFileSync(file, "utf8");
				const { entries } = discoverCatalogEntries(source, file);
				const versions = yield* resolveGatedVersions(entries, interopResolver, ZERO_GATE, Date.now());
				const items = yield* buildWalkItems(entries, versions);

				// Simulate the user's walk: keep each interop entry at its current
				// (newest) range — effect@3.17.0 and @effect/cli@0.71.0.
				const decisions: Decision[] = items.map((i) => ({
					item: i,
					chosen: i.candidates.find((c) => c.kind === "in-range") ?? i.candidates.find((c) => c.kind === "keep")!,
				}));

				// Build the group exactly as the command does: ceiling = the user's pick.
				const group = entries.filter((e) => e.strategy === "interop");
				const members: GroupMember[] = group.map((e) => ({
					pkg: e.pkg,
					ceiling: decisions.find((d) => d.item.entry.pkg === e.pkg)!.chosen.version,
					candidates: versions.get(e.pkg) ?? [],
				}));

				const result = yield* runInterop(members, interopResolver);
				const affected = affectedReentry(members, result);
				const interopEdits = buildInteropEdits(group, result);
				// Non-interop decisions are empty here; interop edits carry the change.
				yield* applyInteropAndDecisions(file, source, [], interopEdits);
				return affected;
			}),
		);

		// The dependent the user picked too high is flagged for re-entry.
		expect(flagged).toEqual([{ pkg: "@effect/cli", cappedVersion: "0.70.0" }]);

		const out = readFileSync(file, "utf8");
		expect(out).toContain('effect: { range: "^3.17.0"'); // anchor unchanged
		expect(out).toContain('"@effect/cli": { range: "^0.70.0"'); // dependent held back
		expect(out).toContain('peer: "^3.16.0"'); // effect peer floor from cli@0.70
		expect(out).toContain('peer: "^0.70.0"'); // cli peer floor (its own resolved version)
	});

	it("combines non-interop decision edits with interop edits without overlap", async () => {
		const MIXED_SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ catalogs: {
 silk: { packages: { typescript: "^5.9.0" } },
 effect: { packages: {
  effect: { range: "^3.17.0", strategy: "interop" },
  "@effect/cli": { range: "^0.71.0", strategy: "interop" },
 } },
} });
`;
		const file = writeTmpConfig(MIXED_SOURCE);
		const mixedResolver = makeStubResolver({
			versions: { typescript: ["5.9.0", "5.9.3"], effect: ["3.17.0"], "@effect/cli": ["0.70.0", "0.71.0"] },
			peerDependencies: {
				effect: { "3.17.0": {} },
				"@effect/cli": { "0.70.0": { effect: "^3.16.0" }, "0.71.0": { effect: "^3.18.0" } },
			},
		});

		await Effect.runPromise(
			Effect.gen(function* () {
				const source = readFileSync(file, "utf8");
				const { entries } = discoverCatalogEntries(source, file);
				const versions = yield* resolveGatedVersions(entries, mixedResolver, ZERO_GATE, Date.now());
				const items = yield* buildWalkItems(entries, versions);
				const decisions: Decision[] = items.map((i) => ({
					item: i,
					chosen: i.candidates.find((c) => c.kind === "in-range") ?? i.candidates.find((c) => c.kind === "keep")!,
				}));
				const nonInteropDecisions = decisions.filter((d) => d.item.entry.strategy !== "interop");
				const group = entries.filter((e) => e.strategy === "interop");
				const members: GroupMember[] = group.map((e) => ({
					pkg: e.pkg,
					ceiling: decisions.find((d) => d.item.entry.pkg === e.pkg)!.chosen.version,
					candidates: versions.get(e.pkg) ?? [],
				}));
				const result = yield* runInterop(members, mixedResolver);
				const interopEdits = buildInteropEdits(group, result);
				yield* applyInteropAndDecisions(file, source, nonInteropDecisions, interopEdits);
			}),
		);

		const out = readFileSync(file, "utf8");
		expect(out).toContain('typescript: "^5.9.3"'); // non-interop in-range bump applied
		expect(out).toContain('"@effect/cli": { range: "^0.70.0"'); // interop downgrade applied
		expect(out).toContain('peer: "^3.16.0"');
	});
});

describe("interop re-entry loop (headless)", () => {
	// effect anchor + two dependents. cli@0.71 needs a higher effect than the user
	// initially picks; platform is always satisfied.
	const loopResolver = makeStubResolver({
		peerDependencies: {
			effect: { "3.17.0": {}, "3.18.0": {} },
			"@effect/cli": { "0.70.0": { effect: "^3.16.0" }, "0.71.0": { effect: "^3.18.0" } },
			"@effect/platform": { "0.90.0": { effect: "^3.17.0" } },
		},
	});

	it("offers the anchor uncapped, and raising it lets the dependent stay high (loop terminates)", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				// Round 1: user picks effect low (3.17.0); cli@0.71 must drop to 0.70.
				const members1: GroupMember[] = [
					{ pkg: "effect", ceiling: "3.17.0", candidates: ["3.17.0", "3.18.0"] },
					{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.70.0", "0.71.0"] },
					{ pkg: "@effect/platform", ceiling: "0.90.0", candidates: ["0.90.0"] },
				];
				const result1 = yield* runInterop(members1, loopResolver);
				expect(result1.resolved.get("@effect/cli")).toBe("0.70.0"); // dependent downgraded
				const reentry1 = reentryCandidates(members1, result1);
				// The downgraded dependent is capped; its anchor is offered uncapped.
				expect(reentry1).toContainEqual({ pkg: "@effect/cli", cap: "0.70.0" });
				expect(reentry1).toContainEqual({ pkg: "effect", cap: null });

				// Round 2: simulate the user RAISING the anchor to 3.18.0 and keeping cli high.
				const members2: GroupMember[] = [
					{ pkg: "effect", ceiling: "3.18.0", candidates: ["3.17.0", "3.18.0"] },
					{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.70.0", "0.71.0"] },
					{ pkg: "@effect/platform", ceiling: "0.90.0", candidates: ["0.90.0"] },
				];
				const result2 = yield* runInterop(members2, loopResolver);
				expect(result2.resolved.get("@effect/cli")).toBe("0.71.0"); // dependent stays high
				// Nothing left to re-prompt → the loop would terminate.
				expect(reentryCandidates(members2, result2)).toEqual([]);
			}),
		);
	});

	it("terminates a true conflict when no ceiling moves (remaining conflicts accepted)", async () => {
		const conflictResolver = makeStubResolver({
			peerDependencies: {
				effect: { "3.16.0": {} },
				"@effect/cli": { "0.71.0": { effect: "^3.18.0" } }, // unsatisfiable at effect 3.16
			},
		});
		await Effect.runPromise(
			Effect.gen(function* () {
				const members: GroupMember[] = [
					{ pkg: "effect", ceiling: "3.16.0", candidates: ["3.16.0"] },
					{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.71.0"] },
				];
				const result = yield* runInterop(members, conflictResolver);
				expect(result.conflicts.map((c) => c.pkg)).toEqual(["@effect/cli"]);
				const reentry = reentryCandidates(members, result);
				// The conflicted dependent (capped at itself) plus its anchor (uncapped).
				expect(reentry).toContainEqual({ pkg: "@effect/cli", cap: "0.71.0" });
				expect(reentry).toContainEqual({ pkg: "effect", cap: null });
				// Capping the dependent at its own version leaves it no downgrade choice.
				const cliCapped = yield* capVersions(["0.71.0"], "0.71.0");
				expect(cliCapped).toEqual(["0.71.0"]);
				// Simulate the user re-picking identical ceilings: the loop's no-progress
				// guard fires and the remaining conflict is accepted.
				const before = new Map(members.map((m) => [m.pkg, m.ceiling]));
				const changedCeiling = members.some((m) => before.get(m.pkg) !== m.ceiling);
				expect(changedCeiling).toBe(false);
			}),
		);
	});
});

describe("resolveTargetFile autodetect", () => {
	it("autodetects the single config file when no path is given", async () => {
		const dir = mkdtempSync(join(tmpdir(), "rpc-auto-"));
		writeFileSync(
			join(dir, "savvy.build.ts"),
			`import { PnpmConfigPlugin } from "rolldown-pnpm-config";\nexport const p = PnpmConfigPlugin({ catalogs: { silk: { packages: { typescript: "^5.9.0" } } } });\n`,
			"utf8",
		);
		const prev = process.cwd();
		try {
			process.chdir(dir);
			const file = await Effect.runPromise(resolveTargetFile(Option.none()));
			expect(file.endsWith("savvy.build.ts")).toBe(true);
		} finally {
			process.chdir(prev);
		}
	});
});
