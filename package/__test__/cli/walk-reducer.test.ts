import { describe, expect, it } from "vitest";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import {
	cellColor,
	displayCandidates,
	initTable,
	tableDecisions,
	tableStep,
	truncateEnd,
} from "../../src/cli/walk-reducer.js";
import type { WalkItem } from "../../src/cli/walk-types.js";

const entry = (pkg: string): CatalogEntry => ({
	catalog: "default",
	pkg,
	currentRange: "^1.0.0",
	operator: "^",
	rangeSpan: [0, 8],
});

const keep: Candidate = { kind: "keep", range: "^1.0.0", version: "1.0.0", isMajor: false };
const inRange: Candidate = { kind: "in-range", range: "^1.2.0", version: "1.2.0", isMajor: false };
const minor: Candidate = { kind: "minor", range: "^1.9.0", version: "1.9.0", isMajor: false };
const latest: Candidate = { kind: "latest", range: "^2.0.0", version: "2.0.0", isMajor: true };

const item = (pkg: string, candidates: readonly Candidate[]): WalkItem => ({
	entry: entry(pkg),
	candidates,
	upToDate: candidates.length === 1,
	driftPeer: null,
	materializePeer: null,
	peerWarning: null,
});

describe("displayCandidates", () => {
	it("puts keep first, then in-range, then latest", () => {
		const kinds = displayCandidates(item("a", [inRange, latest, keep])).map((c) => c.kind);
		expect(kinds).toEqual(["keep", "in-range", "latest"]);
	});

	it("returns a single keep for an up-to-date row", () => {
		expect(displayCandidates(item("a", [keep])).map((c) => c.kind)).toEqual(["keep"]);
	});

	it("orders keep, in-range, minor, latest", () => {
		const kinds = displayCandidates(item("a", [latest, minor, keep, inRange])).map((c) => c.kind);
		expect(kinds).toEqual(["keep", "in-range", "minor", "latest"]);
	});
});

describe("truncateEnd", () => {
	it("leaves a short string unchanged", () => {
		expect(truncateEnd("hi", 5)).toBe("hi");
	});
	it("clips a long string and appends an ellipsis", () => {
		expect(truncateEnd("hello world", 5)).toBe("hell…");
	});
	it("degrades to just the ellipsis at max ≤ 1", () => {
		expect(truncateEnd("hello", 1)).toBe("…");
	});
});

describe("initTable", () => {
	it("selects keep on every row and starts the cursor at the first row", () => {
		const items = [item("a", [inRange, keep]), item("b", [inRange, latest, keep])];
		const state = initTable(items);
		expect(state).toEqual({ cursor: 0, picks: [0, 0], done: false, cancelled: false });
	});

	it("starts the cursor on the first actionable row when earlier rows are up to date", () => {
		// All rows are shown (up-to-date included), so the cursor should skip past
		// inert keep-only rows and land where the user can actually act.
		const items = [item("a", [keep]), item("b", [keep]), item("c", [inRange, keep])];
		expect(initTable(items).cursor).toBe(2);
	});

	it("starts the cursor at row 0 when every row is up to date", () => {
		const items = [item("a", [keep]), item("b", [keep])];
		expect(initTable(items).cursor).toBe(0);
	});
});

describe("tableStep", () => {
	const items = [item("a", [inRange, keep]), item("b", [inRange, latest, keep])];

	it("down and up move the cursor between rows, clamped at the ends", () => {
		let s = initTable(items);
		s = tableStep(s, items, "down");
		expect(s.cursor).toBe(1);
		s = tableStep(s, items, "down");
		expect(s.cursor).toBe(1);
		s = tableStep(s, items, "up");
		expect(s.cursor).toBe(0);
		s = tableStep(s, items, "up");
		expect(s.cursor).toBe(0);
	});

	it("right and left move the selection within a row, clamped at the ends", () => {
		let s = initTable(items);
		s = tableStep(s, items, "right");
		expect(s.picks[0]).toBe(1);
		s = tableStep(s, items, "right");
		expect(s.picks[0]).toBe(1); // row "a" has only keep + in-range
		s = tableStep(s, items, "left");
		expect(s.picks[0]).toBe(0);
		s = tableStep(s, items, "left");
		expect(s.picks[0]).toBe(0);
	});

	it("moves only the row under the cursor", () => {
		let s = initTable(items);
		s = tableStep(s, items, "down");
		s = tableStep(s, items, "right");
		expect(s.picks).toEqual([0, 1]);
	});

	it("submit ends the walk without cancelling", () => {
		const s = tableStep(initTable(items), items, "submit");
		expect(s.done).toBe(true);
		expect(s.cancelled).toBe(false);
	});

	it("cancel ends the walk and marks it cancelled", () => {
		const s = tableStep(initTable(items), items, "cancel");
		expect(s.done).toBe(true);
		expect(s.cancelled).toBe(true);
	});

	it("ignores further keys once done", () => {
		const done = tableStep(initTable(items), items, "submit");
		expect(tableStep(done, items, "down")).toBe(done);
	});
});

describe("tableDecisions", () => {
	const items = [item("a", [inRange, keep]), item("b", [inRange, latest, keep])];

	it("maps each row's pick to its chosen candidate", () => {
		let s = initTable(items);
		s = tableStep(s, items, "right"); // row a → in-range
		s = tableStep(s, items, "down");
		s = tableStep(s, items, "right");
		s = tableStep(s, items, "right"); // row b → latest
		const decisions = tableDecisions(s, items);
		expect(decisions.map((d) => d.chosen.kind)).toEqual(["in-range", "latest"]);
		expect(decisions.map((d) => d.item.entry.pkg)).toEqual(["a", "b"]);
	});

	it("defaults every row to keep", () => {
		const decisions = tableDecisions(initTable(items), items);
		expect(decisions.map((d) => d.chosen.kind)).toEqual(["keep", "keep"]);
	});

	it("returns no decisions when cancelled", () => {
		const s = tableStep(initTable(items), items, "cancel");
		expect(tableDecisions(s, items)).toEqual([]);
	});
});

describe("cellColor", () => {
	// A selected KEEP must NOT be colored. It is the current value, not a change,
	// and dimming it made the leftmost column — the one the eye lands on first —
	// read as disabled. Regression guard: this returned "gray" before.
	it("leaves a selected keep uncolored", () => {
		expect(cellColor(keep, true)).toBeNull();
	});

	it("colors a selected in-range upgrade green and a selected major yellow", () => {
		expect(cellColor(inRange, true)).toBe("green");
		expect(cellColor(latest, true)).toBe("yellow");
	});

	it("leaves every unselected candidate uncolored", () => {
		expect(cellColor(keep, false)).toBeNull();
		expect(cellColor(inRange, false)).toBeNull();
		expect(cellColor(latest, false)).toBeNull();
	});
});
