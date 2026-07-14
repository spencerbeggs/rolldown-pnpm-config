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
	peerWarning: null,
	...over,
});

const effectEntry = entry({ catalog: "default", pkg: "effect" });
const effectDecision: Decision = {
	item: item(effectEntry, {
		candidates: [
			cand({ kind: "keep", range: "^3.21.4", version: "3.21.4", isMajor: false }),
			cand({ kind: "in-range", range: "^3.21.9", version: "3.21.9", isMajor: false }),
		],
	}),
	chosen: cand({ kind: "in-range", range: "^3.21.9", version: "3.21.9", isMajor: false }),
};
const decisions: Decision[] = [effectDecision];

const warnEntry = entry({ catalog: "default", pkg: "silk-lock" });
const warnDecision: Decision = {
	item: item(warnEntry, {
		candidates: [
			cand({ kind: "keep", range: "^3.0.0", version: "3.0.0", isMajor: false }),
			cand({ kind: "in-range", range: "^3.1.0", version: "3.1.0", isMajor: false }),
		],
		peerWarning: { kind: "lock-minor-prerelease", message: "lock-minor cannot floor the prerelease" },
	}),
	chosen: cand({ kind: "keep", range: "^3.0.0", version: "3.0.0", isMajor: false }),
};
const warnDecisions: Decision[] = [warnDecision];

describe("renderSummary", () => {
	it("lists a decision as a table row with its bubble filled and a tally", () => {
		const chosen = cand({});
		const d: Decision = {
			item: item(entry({}), {
				candidates: [cand({ kind: "keep", range: "^5.9.0", version: "5.9.0", isMajor: false }), chosen],
			}),
			chosen,
		};
		const out = renderSummary([d]);
		expect(out).toContain("silk");
		expect(out).toContain("typescript");
		expect(out).toContain("● ^5.9.3");
		expect(out).toContain("1 to update");
	});

	it("reports a materialized peer on keep when strategy-without-peer", () => {
		const e = entry({ strategy: "lock-minor" }); // no peer
		const d: Decision = {
			item: item(e, {
				materializePeer: "^5.9.0",
				candidates: [cand({ kind: "keep", range: "^5.9.0", version: "5.9.0", isMajor: false })],
			}),
			chosen: cand({ kind: "keep", range: "^5.9.0", version: "5.9.0", isMajor: false }),
		};
		const out = renderSummary([d]);
		expect(out).toContain("│ ^5.9.0");
		expect(out).toContain("1 new peer");
	});

	it("renders resync and tallies keep+driftPeer as 1 resync, peer shown via the separator", () => {
		const e = entry({
			pkg: "vitest",
			currentRange: "^4.2.3",
			peer: { value: "^4.1.0", span: [20, 28] },
		});
		const keepCand = cand({ kind: "keep", range: "^4.2.3", version: "4.2.3", isMajor: false });
		const d: Decision = {
			item: item(e, { driftPeer: "^4.2.0", candidates: [keepCand] }),
			chosen: keepCand,
		};
		const out = renderSummary([d]);
		expect(out).toContain("│ ^4.2.0");
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

	it("renders each decision as a table row with the chosen bubble filled", () => {
		const text = renderSummary(decisions, undefined, { color: false });
		expect(text).toContain("● ^3.21.9");
		expect(text).toContain("○ ^3.21.4");
	});

	it("groups rows by catalog", () => {
		expect(renderSummary(decisions, undefined, { color: false })).toContain("catalog: default");
	});

	it("reports a rejected edit", () => {
		const rejected = [
			{
				pkg: "@changesets/cli",
				kind: "peer" as const,
				value: "^3.0.0",
				reason: "no published version of @changesets/cli satisfies ^3.0.0",
			},
		];
		const text = renderSummary(decisions, undefined, { color: false }, rejected);
		expect(text).toContain("^3.0.0");
		expect(text).toContain("no published version");
	});

	it("reports a peer warning", () => {
		const text = renderSummary(warnDecisions, undefined, { color: false });
		expect(text).toContain("lock-minor");
	});

	it("aligns the peer separator at the same column across rows with differing candidate counts", () => {
		// oneCandidate has 1 candidate (keep only), effect has 2, majorRow has 2 with
		// a major on its second — mixed cell counts that must still all land the "│"
		// separator in the same column.
		const oneCandidateEntry = entry({ catalog: "default", pkg: "oxc-parser" });
		const oneCandidateDecision: Decision = {
			item: item(oneCandidateEntry, {
				candidates: [cand({ kind: "keep", range: "0.139.0", version: "0.139.0", isMajor: false })],
				upToDate: true,
			}),
			chosen: cand({ kind: "keep", range: "0.139.0", version: "0.139.0", isMajor: false }),
		};
		const majorEntry = entry({ catalog: "default", pkg: "react" });
		const majorDecision: Decision = {
			item: item(majorEntry, {
				candidates: [
					cand({ kind: "keep", range: "^18.3.1", version: "18.3.1", isMajor: false }),
					cand({ kind: "latest", range: "^19.2.0", version: "19.2.0", isMajor: true }),
				],
			}),
			chosen: cand({ kind: "latest", range: "^19.2.0", version: "19.2.0", isMajor: true }),
		};
		const mixed: Decision[] = [oneCandidateDecision, effectDecision, majorDecision];
		const text = renderSummary(mixed, undefined, { color: false });
		const separatorColumns = text
			.split("\n")
			.filter((line) => line.includes("│"))
			.map((line) => line.indexOf("│"));

		expect(separatorColumns.length).toBeGreaterThan(1);
		expect(new Set(separatorColumns).size).toBe(1);
	});
});
