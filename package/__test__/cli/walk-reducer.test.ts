import { describe, expect, it } from "vitest";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import { initWalk, walkStep } from "../../src/cli/walk-reducer.js";
import type { WalkItem } from "../../src/cli/walk-types.js";

const entry = (pkg: string): CatalogEntry => ({
	catalog: "silk",
	pkg,
	currentRange: "^5.9.0",
	operator: "^",
	rangeSpan: [0, 8],
});
const C = (kind: Candidate["kind"], range: string): Candidate => ({
	kind,
	range,
	version: range.replace(/^[\^~]/, ""),
	isMajor: false,
});
const item = (pkg: string, upToDate: boolean, candidates: Candidate[]): WalkItem => ({
	entry: entry(pkg),
	candidates,
	upToDate,
	driftPeer: null,
	materializePeer: null,
});

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
