import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { buildEdits } from "../../src/cli/edits.js";
import type { Candidate, CatalogEntry } from "../../src/cli/types.js";
import { buildWalkItems } from "../../src/cli/walk-plan.js";
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
	peerWarning: null,
	...over,
});

describe("buildEdits", () => {
	it("emits a range edit and a peer edit for a chosen upgrade with strategy", () => {
		const e = entry({ rangeSpan: [0, 8], peer: { value: "^1.0.0", span: [10, 18] }, strategy: "lock-minor" });
		const d: Decision = { item: item(e), chosen: cand({ range: "^1.2.0", peerRange: "^1.2.0" }) };
		expect(buildEdits([d])).toEqual([
			{ span: [0, 8], text: '"^1.2.0"', pkg: "x", kind: "range", value: "^1.2.0" },
			{ span: [10, 18], text: '"^1.2.0"', pkg: "x", kind: "peer", value: "^1.2.0" },
		]);
	});

	it("emits no edit for a plain keep", () => {
		const e = entry({});
		expect(buildEdits([{ item: item(e), chosen: cand({ kind: "keep", range: "^1.0.0" }) }])).toEqual([]);
	});

	it("emits a peer-only resync edit when keeping but the peer drifted", () => {
		const e = entry({ peer: { value: "^1.0.0", span: [10, 18] }, strategy: "lock-minor" });
		const d: Decision = { item: item(e, { driftPeer: "^1.1.0" }), chosen: cand({ kind: "keep", range: "^1.0.0" }) };
		expect(buildEdits([d])).toEqual([{ span: [10, 18], text: '"^1.1.0"', pkg: "x", kind: "peer", value: "^1.1.0" }]);
	});

	it("inserts a new peer literal on upgrade when strategy is set but no peer exists", () => {
		const e = entry({ rangeSpan: [10, 18], strategy: "lock-minor" }); // no peer
		const d: Decision = { item: item(e), chosen: cand({ range: "^1.2.0", peerRange: "^1.2.0" }) };
		expect(buildEdits([d])).toEqual([
			{ span: [10, 18], text: '"^1.2.0"', pkg: "x", kind: "range", value: "^1.2.0" },
			{ span: [18, 18], text: ', peer: "^1.2.0"', pkg: "x", kind: "peer", value: "^1.2.0" },
		]);
	});

	it("inserts a new peer literal on keep via materializePeer when strategy is set but no peer exists", () => {
		const e = entry({ rangeSpan: [10, 18], strategy: "lock-minor" }); // no peer
		const d: Decision = {
			item: item(e, { materializePeer: "^1.0.0" }),
			chosen: cand({ kind: "keep", range: "^1.0.0" }),
		};
		expect(buildEdits([d])).toEqual([
			{ span: [18, 18], text: ', peer: "^1.0.0"', pkg: "x", kind: "peer", value: "^1.0.0" },
		]);
	});

	it("a keep on an in-sync prerelease entry produces no peer edit", async () => {
		// Regression test for the derivePeerRange prerelease-drop bug: driftPeer
		// must be DERIVED via buildWalkItems (not stubbed to null), since the bug
		// only manifests through detectPeerDrift's comparison against the
		// derived range. A hardcoded `driftPeer: null` would pass with or
		// without the fix.
		const e = entry({
			pkg: "@changesets/cli",
			currentRange: "^3.0.0-next.8",
			rangeSpan: [0, 15],
			peer: { value: "^3.0.0-next.8", span: [20, 35] },
			strategy: "lock",
		});
		const items = await Effect.runPromise(buildWalkItems([e], new Map([["@changesets/cli", ["3.0.0-next.8"]]])));
		const keep = items[0]?.candidates[items[0].candidates.length - 1];
		expect(keep?.kind).toBe("keep");
		expect(buildEdits([{ item: items[0] as WalkItem, chosen: keep as Candidate }])).toEqual([]);
	});

	it("tags each edit with its package, kind and unquoted range", () => {
		const entry: CatalogEntry = {
			catalog: "default",
			pkg: "effect",
			currentRange: "^3.21.4",
			operator: "^",
			rangeSpan: [0, 9],
			peer: { value: "^3.21.0", span: [20, 29] },
			strategy: "lock",
		};
		const chosen = {
			kind: "in-range" as const,
			range: "^3.21.9",
			version: "3.21.9",
			isMajor: false,
			peerRange: "^3.21.9",
		};
		const edits = buildEdits([
			{
				item: {
					entry,
					candidates: [chosen],
					upToDate: false,
					driftPeer: null,
					materializePeer: null,
					peerWarning: null,
				},
				chosen,
			},
		]);
		expect(edits).toEqual([
			{ span: [0, 9], text: '"^3.21.9"', pkg: "effect", kind: "range", value: "^3.21.9" },
			{ span: [20, 29], text: '"^3.21.9"', pkg: "effect", kind: "peer", value: "^3.21.9" },
		]);
	});
});
