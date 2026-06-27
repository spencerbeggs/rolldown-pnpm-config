import { describe, expect, it } from "vitest";
import { buildEdits } from "../../src/cli/edits.js";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import type { Decision, WalkItem } from "../../src/cli/walk-types.js";

const entry = (o: Partial<CatalogEntry>): CatalogEntry => ({
	catalog: "silk",
	pkg: "x",
	currentRange: "^1.0.0",
	operator: "^",
	rangeSpan: [0, 8],
	...o,
});
const cand = (o: Partial<Candidate>): Candidate => ({
	kind: "in-range",
	range: "^1.2.0",
	version: "1.2.0",
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
		const d: Decision = {
			item: item(e, { materializePeer: "^1.0.0" }),
			chosen: cand({ kind: "keep", range: "^1.0.0" }),
		};
		expect(buildEdits([d])).toEqual([{ span: [18, 18], text: ', peer: "^1.0.0"' }]);
	});
});
