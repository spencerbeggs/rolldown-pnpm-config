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
		expect(c.map((x) => [x.kind, x.range, x.isMajor])).toEqual([
			["in-range", "^5.9.3", false],
			["latest", "^7.1.0", true],
			["keep", "^5.9.0", false],
		]);
	});

	it("returns only keep when already at the newest stable version", async () => {
		const c = await run(entry({ currentRange: "^7.1.0", rangeSpan: [0, 8] }), ["7.1.0"]);
		expect(c.map((x) => x.kind)).toEqual(["keep"]);
	});

	it("does not offer a downgrade when the config is pinned ahead of the registry", async () => {
		const c = await run(entry({ currentRange: "^5.9.5", rangeSpan: [0, 8] }), ["5.9.0", "5.9.3"]);
		expect(c.map((x) => x.kind)).toEqual(["keep"]);
	});

	it("attaches a recomputed peerRange when the entry has a strategy", async () => {
		const c = await run(
			entry({ currentRange: "^4.0.0", strategy: "lock-minor", peer: { value: "^4.0.0", span: [0, 8] } }),
			["4.0.0", "4.2.3"],
		);
		const inRange = c.find((x) => x.kind === "in-range");
		expect(inRange?.range).toBe("^4.2.3");
		expect(inRange?.peerRange).toBe("^4.2.0");
		const keep = c.find((x) => x.kind === "keep");
		expect(keep?.peerRange).toBeUndefined();
	});
});
