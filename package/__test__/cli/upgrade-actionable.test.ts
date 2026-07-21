/**
 * The interactive upgrade table now shows EVERY discovered row — up-to-date rows
 * included, as non-selectable context — so a fully up-to-date catalog is never
 * hidden. The old `actionableWalkItems` up-to-date filter (and its `--full`
 * override) was removed; the cursor-on-first-actionable behavior is covered in
 * `walk-reducer.test.ts` / `walk-ui.test.ts`. Only the discover-nothing message
 * remains here.
 */
import { describe, expect, it } from "vitest";
import { nothingToUpgradeMessage } from "../../src/cli/commands/upgrade.js";

describe("nothingToUpgradeMessage", () => {
	it("reports the up-to-date package count when items were discovered", () => {
		expect(nothingToUpgradeMessage(3)).toBe("Nothing to upgrade — 3 package(s) already up to date.\n");
	});

	it("reports no packages found when nothing was discovered at all", () => {
		expect(nothingToUpgradeMessage(0)).toBe("Nothing to upgrade — no catalog packages found.\n");
	});
});
