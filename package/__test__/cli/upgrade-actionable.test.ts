/**
 * Regression coverage for the interactive table's up-to-date filter.
 *
 * The old per-package walk auto-skipped up-to-date packages via a
 * `nextActionable` cursor helper. The table UI rewrite (b85f150) dropped that
 * behavior: every discovered item, up-to-date or not, was handed to
 * `runWalk`. `actionableWalkItems` restores the filter as an upfront step —
 * these tests exercise the REAL exported function `upgradeCommand` calls
 * before `runWalk`, so reverting it to a passthrough breaks these tests.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { actionableWalkItems, nothingToUpgradeMessage } from "../../src/cli/commands/upgrade.js";
import type { CatalogEntry } from "../../src/cli/types.js";
import { buildWalkItems } from "../../src/cli/walk-plan.js";

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
	catalog: "silk",
	pkg: "typescript",
	currentRange: "^5.9.0",
	operator: "^",
	rangeSpan: [0, 8],
	...over,
});

const build = (entries: CatalogEntry[], v: Record<string, string[]>) =>
	Effect.runPromise(buildWalkItems(entries, new Map(Object.entries(v))));

describe("actionableWalkItems", () => {
	it("excludes an up-to-date row by default, keeping the one with an available upgrade", async () => {
		const items = await build(
			[
				entry({ pkg: "typescript", currentRange: "^5.9.0", rangeSpan: [0, 8] }),
				// Truly up-to-date: only keep candidate, no drift, no materialize.
				entry({ pkg: "zod", currentRange: "^3.24.0", rangeSpan: [10, 20] }),
			],
			{ typescript: ["5.9.0", "5.9.3"], zod: ["3.24.0"] },
		);
		expect(items.find((i) => i.entry.pkg === "zod")!.upToDate).toBe(true);

		const actionable = actionableWalkItems(items, false);
		expect(actionable.map((i) => i.entry.pkg)).toEqual(["typescript"]);
	});

	it("--full includes the up-to-date row alongside the actionable one", async () => {
		const items = await build(
			[
				entry({ pkg: "typescript", currentRange: "^5.9.0", rangeSpan: [0, 8] }),
				entry({ pkg: "zod", currentRange: "^3.24.0", rangeSpan: [10, 20] }),
			],
			{ typescript: ["5.9.0", "5.9.3"], zod: ["3.24.0"] },
		);

		const actionable = actionableWalkItems(items, true);
		expect(actionable.map((i) => i.entry.pkg)).toEqual(["typescript", "zod"]);
	});

	it("keeps a peer-only row (drift resync) visible by default — it is not up-to-date", async () => {
		// vitest is already at its newest published version, but its existing peer
		// literal (^4.1.0) has drifted from what lock-minor would derive from the
		// current range (^4.2.0) — a peer-only actionable row, not a keep-only one.
		const items = await build(
			[
				entry({
					pkg: "vitest",
					currentRange: "^4.2.3",
					rangeSpan: [0, 8],
					strategy: "lock-minor",
					peer: { value: "^4.1.0", span: [10, 18] },
				}),
			],
			{ vitest: ["4.2.3"] },
		);
		const vitestItem = items[0];
		expect(vitestItem.upToDate).toBe(false);
		expect(vitestItem.driftPeer).toBe("^4.2.0");

		const actionable = actionableWalkItems(items, false);
		expect(actionable).toHaveLength(1);
		expect(actionable[0]?.entry.pkg).toBe("vitest");
	});

	it("keeps a peer-only row (materialize) visible by default — it is not up-to-date", async () => {
		// No peer literal exists yet, but the strategy declares one to materialize —
		// actionable even though the range itself has no upgrade available.
		const items = await build(
			[entry({ pkg: "typescript", currentRange: "^5.9.0", rangeSpan: [0, 8], strategy: "lock-minor" })],
			{ typescript: ["5.9.0"] },
		);
		const tsItem = items[0];
		expect(tsItem.upToDate).toBe(false);
		expect(tsItem.materializePeer).toBe("^5.9.0");

		const actionable = actionableWalkItems(items, false);
		expect(actionable).toHaveLength(1);
	});
});

describe("nothingToUpgradeMessage", () => {
	it("reports the up-to-date package count when items were discovered", () => {
		expect(nothingToUpgradeMessage(3)).toBe("Nothing to upgrade — 3 package(s) already up to date.\n");
	});

	it("reports no packages found when nothing was discovered at all", () => {
		expect(nothingToUpgradeMessage(0)).toBe("Nothing to upgrade — no catalog packages found.\n");
	});
});
