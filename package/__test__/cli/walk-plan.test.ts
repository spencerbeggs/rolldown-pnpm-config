import { Effect } from "effect";
import { describe, expect, it } from "vitest";
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

const run = (entries: CatalogEntry[], v: Record<string, string[]>) =>
	Effect.runPromise(buildWalkItems(entries, new Map(Object.entries(v))));

describe("buildWalkItems", () => {
	it("attaches candidates, upToDate, and drift per entry", async () => {
		const items = await run(
			[
				entry({ pkg: "typescript", currentRange: "^5.9.0", rangeSpan: [0, 8] }),
				entry({
					pkg: "vitest",
					currentRange: "^4.2.3",
					rangeSpan: [10, 18],
					strategy: "lock-minor",
					peer: { value: "^4.1.0", span: [20, 28] },
				}),
				// Truly up-to-date: only keep candidate, no drift.
				entry({ pkg: "zod", currentRange: "^3.24.0", rangeSpan: [30, 40] }),
			],
			{ typescript: ["5.9.0", "5.9.3", "7.1.0"], vitest: ["4.2.3"], zod: ["3.24.0"] },
		);
		const ts = items.find((i) => i.entry.pkg === "typescript")!;
		expect(ts.candidates.map((c) => c.kind)).toEqual(["in-range", "latest", "keep"]);
		expect(ts.upToDate).toBe(false);

		// Has drift: newest but peer drifted → NOT up-to-date.
		const vitest = items.find((i) => i.entry.pkg === "vitest")!;
		expect(vitest.upToDate).toBe(false); // peer drifted — must be actionable
		expect(vitest.driftPeer).toBe("^4.2.0"); // peer ^4.1.0 drifted from lock-minor of ^4.2.3

		// Truly up-to-date: no drift, only keep candidate.
		const zod = items.find((i) => i.entry.pkg === "zod")!;
		expect(zod.upToDate).toBe(true);
		expect(zod.driftPeer).toBeNull();
	});

	it("computes materializePeer and marks the item actionable for strategy-without-peer", async () => {
		const items = await run(
			[entry({ pkg: "ts", currentRange: "^5.9.0", rangeSpan: [0, 8], strategy: "lock-minor" })], // no peer
			{ ts: ["5.9.0"] }, // already newest → only keep candidate
		);
		const it0 = items[0];
		expect(it0.materializePeer).toBe("^5.9.0"); // lock-minor of 5.9.0
		expect(it0.upToDate).toBe(false); // actionable because there is a peer to materialize
	});
});
