import { describe, expect, it } from "vitest";
import { renderSummary } from "../../src/cli/summary.js";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import type { Decision, WalkItem } from "../../src/cli/walk-types.js";

const entry = (o: Partial<CatalogEntry>): CatalogEntry => ({
	catalog: "silk",
	pkg: "typescript",
	currentRange: "^5.9.0",
	operator: "^",
	rangeSpan: [0, 8],
	...o,
});
const cand = (o: Partial<Candidate>): Candidate => ({
	kind: "in-range",
	range: "^5.9.3",
	version: "5.9.3",
	isMajor: false,
	...o,
});
const item = (e: CatalogEntry, over: Partial<WalkItem> = {}): WalkItem => ({
	entry: e,
	candidates: [],
	upToDate: false,
	driftPeer: null,
	materializePeer: null,
	...over,
});

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

	it("reports a materialized peer on keep when strategy-without-peer", () => {
		const e = entry({ strategy: "lock-minor" }); // no peer
		const d: Decision = {
			item: item(e, { materializePeer: "^5.9.0" }),
			chosen: cand({ kind: "keep", range: "^5.9.0" }),
		};
		const out = renderSummary([d]);
		expect(out).toContain("new peer");
		expect(out).toContain("^5.9.0");
		expect(out).toContain("1 new peer");
	});

	it("renders resync line and tallies keep+driftPeer as 1 resync", () => {
		const e = entry({
			pkg: "vitest",
			currentRange: "^4.2.3",
			peer: { value: "^4.1.0", span: [20, 28] },
		});
		const keepCand = cand({ kind: "keep", range: "^4.2.3", version: "4.2.3", isMajor: false });
		const d: Decision = {
			item: item(e, { driftPeer: "^4.2.0" }),
			chosen: keepCand,
		};
		const out = renderSummary([d]);
		expect(out).toContain("resync peer");
		expect(out).toContain("↳ peer");
		expect(out).toContain("^4.1.0");
		expect(out).toContain("^4.2.0");
		expect(out).toContain("1 resync");
	});

	it("renders interop adjustments and conflicts", () => {
		const text = renderSummary([], {
			adjustments: [{ catalog: "effect", pkg: "@effect/cli", from: "^0.71.0", to: "^0.70.0", peer: "^3.16.0" }],
			conflicts: [{ pkg: "@effect/foo", ceiling: "1.2.0", blockedBy: "effect@^4.0.0" }],
		});
		expect(text).toContain("↓ @effect/cli  ^0.71.0 → ^0.70.0");
		expect(text).toContain("⚠ @effect/foo");
	});
});
