import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { InteropConflict, InteropResult, PeerDepsOf } from "../../src/cli/interop.js";
import {
	buildInteropEdits,
	capVersions,
	deriveFloors,
	interopEntryChanged,
	reentryCandidates,
	resolveGroup,
	runInterop,
} from "../../src/cli/interop.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const run = <A>(e: Effect.Effect<A, never>) => Effect.runPromise(e);

/** Build an InteropResult fixture; peers/conflicts/peerDepsOf default to empty. */
function makeResult(o: {
	resolved: ReadonlyMap<string, string>;
	peers?: ReadonlyMap<string, string>;
	conflicts?: readonly InteropConflict[];
	peerDepsOf?: PeerDepsOf;
}): InteropResult {
	return {
		resolved: o.resolved,
		peers: o.peers ?? new Map<string, string>(),
		conflicts: o.conflicts ?? [],
		peerDepsOf: o.peerDepsOf ?? (() => ({})),
	};
}

describe("deriveFloors", () => {
	it("derives each member's caret floor as the lowest in-group declared floor", async () => {
		const resolved = new Map([
			["effect", "3.17.2"],
			["@effect/platform", "0.90.4"],
			["@effect/cli", "0.70.1"],
		]);
		// platform peers effect ^3.17.0; cli peers effect ^3.16.0 + platform ^0.90.0
		const peers: Record<string, Record<string, string>> = {
			effect: {},
			"@effect/platform": { effect: "^3.17.0" },
			"@effect/cli": { effect: "^3.16.0", "@effect/platform": "^0.90.0" },
		};
		const out = await run(deriveFloors(resolved, (pkg, _v) => Effect.succeed(peers[pkg] ?? {})));
		// effect floor = lowest of {3.17.0 (platform), 3.16.0 (cli)} = 3.16.0
		expect(out.get("effect")).toBe("^3.16.0");
		expect(out.get("@effect/platform")).toBe("^0.90.0");
		// cli: nobody peer-depends on it → fall back to its resolved version
		expect(out.get("@effect/cli")).toBe("^0.70.1");
	});

	it("ignores out-of-group peer dependencies", async () => {
		const resolved = new Map([["effect", "3.17.2"]]);
		const out = await run(deriveFloors(resolved, (_pkg, _v) => Effect.succeed({ react: "^18.0.0" })));
		expect(out.get("effect")).toBe("^3.17.2"); // react is not a member
	});
});

describe("resolveGroup", () => {
	// effect is the anchor (no in-group peers); cli peers effect.
	const peers: Record<string, Record<string, Record<string, string>>> = {
		effect: { "3.16.0": {}, "3.17.0": {}, "3.18.0": {} },
		"@effect/cli": {
			"0.70.0": { effect: "^3.16.0" },
			"0.71.0": { effect: "^3.18.0" },
		},
	};
	const lookup = (pkg: string, v: string) => Effect.succeed(peers[pkg]?.[v] ?? {});

	it("keeps a mutually-compatible set unchanged", async () => {
		const out = await run(
			resolveGroup(
				[
					{ pkg: "effect", ceiling: "3.16.0", candidates: ["3.16.0"] },
					{ pkg: "@effect/cli", ceiling: "0.70.0", candidates: ["0.70.0"] },
				],
				lookup,
			),
		);
		expect(out.conflicts).toEqual([]);
		expect(out.resolved.get("@effect/cli")).toBe("0.70.0");
	});

	it("downgrades the dependent, never the peer target", async () => {
		const out = await run(
			resolveGroup(
				[
					{ pkg: "effect", ceiling: "3.17.0", candidates: ["3.16.0", "3.17.0", "3.18.0"] },
					{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.70.0", "0.71.0"] },
				],
				lookup,
			),
		);
		// cli@0.71 needs effect ^3.18 but effect is pinned at 3.17 → cli drops to 0.70
		expect(out.resolved.get("effect")).toBe("3.17.0");
		expect(out.resolved.get("@effect/cli")).toBe("0.70.0");
		expect(out.conflicts).toEqual([]);
	});

	it("reports a conflict when no candidate ≤ ceiling satisfies the peers", async () => {
		const out = await run(
			resolveGroup(
				[
					{ pkg: "effect", ceiling: "3.16.0", candidates: ["3.16.0"] },
					{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.71.0"] }, // needs effect ^3.18
				],
				lookup,
			),
		);
		expect(out.conflicts.map((c) => c.pkg)).toEqual(["@effect/cli"]);
		expect(out.conflicts[0]?.blockedBy).toContain("effect");
		expect(out.resolved.get("@effect/cli")).toBe("0.71.0"); // left at ceiling
		expect(out.resolved.get("effect")).toBe("3.16.0");
	});
});

describe("runInterop", () => {
	it("resolves the group and derives caret peers, fetching peerDeps via the resolver", async () => {
		const peers: Record<string, Record<string, Record<string, string>>> = {
			effect: { "3.17.0": {} },
			"@effect/cli": { "0.70.0": { effect: "^3.16.0" }, "0.71.0": { effect: "^3.18.0" } },
		};
		const resolver = {
			peerDependencies: (pkg: string, v: string) => Effect.succeed(peers[pkg]?.[v] ?? {}),
		};
		const out = await run(
			runInterop(
				[
					{ pkg: "effect", ceiling: "3.17.0", candidates: ["3.17.0"] },
					{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.70.0", "0.71.0"] },
				],
				resolver,
			),
		);
		expect(out.resolved.get("@effect/cli")).toBe("0.70.0"); // downgraded
		expect(out.peers.get("effect")).toBe("^3.16.0"); // cli@0.70 declares effect ^3.16.0
		expect(out.conflicts).toEqual([]);
		// peerDepsOf is exposed so re-entry can look up anchors.
		expect(out.peerDepsOf("@effect/cli", "0.71.0")).toEqual({ effect: "^3.18.0" });
	});

	it("reuses a shared cache across rounds, fetching each (pkg, version) only once", async () => {
		const fetched: string[] = [];
		const resolver = {
			peerDependencies: (pkg: string, v: string) => {
				fetched.push(`${pkg}@${v}`);
				return Effect.succeed({} as Record<string, string>);
			},
		};
		const members = [
			{ pkg: "effect", ceiling: "3.17.0", candidates: ["3.17.0"] },
			{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.70.0", "0.71.0"] },
		];
		const cache = new Map<string, Record<string, string>>();
		await run(runInterop(members, resolver, cache));
		const afterFirst = fetched.length;
		expect(afterFirst).toBeGreaterThan(0);
		// A second round over the same members must hit the cache for every key.
		await run(runInterop(members, resolver, cache));
		expect(fetched.length).toBe(afterFirst);
	});

	it("fetches afresh each call when no shared cache is passed", async () => {
		const fetched: string[] = [];
		const resolver = {
			peerDependencies: (pkg: string, v: string) => {
				fetched.push(`${pkg}@${v}`);
				return Effect.succeed({} as Record<string, string>);
			},
		};
		const members = [{ pkg: "effect", ceiling: "3.17.0", candidates: ["3.17.0"] }];
		await run(runInterop(members, resolver));
		const afterFirst = fetched.length;
		await run(runInterop(members, resolver));
		expect(fetched.length).toBe(afterFirst * 2);
	});
});

describe("reentryCandidates", () => {
	it("flags a downgraded dependent (capped) and its in-group anchor (uncapped)", () => {
		const members = [
			{ pkg: "effect", ceiling: "3.17.0", candidates: ["3.17.0"] },
			{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.70.0", "0.71.0"] },
		];
		// cli was downgraded 0.71.0 → 0.70.0; cli@0.71.0 peers effect ^3.18.0 (in-group).
		const result = makeResult({
			resolved: new Map([
				["effect", "3.17.0"],
				["@effect/cli", "0.70.0"],
			]),
			peerDepsOf: (pkg, v) => (pkg === "@effect/cli" && v === "0.71.0" ? { effect: "^3.18.0" } : {}),
		});
		const out = reentryCandidates(members, result);
		// The dependent is capped at its resolved version.
		expect(out).toContainEqual({ pkg: "@effect/cli", cap: "0.70.0" });
		// Its anchor is offered uncapped so the user can RAISE it.
		expect(out).toContainEqual({ pkg: "effect", cap: null });
	});

	it("returns nothing for an internally-compatible set", () => {
		const members = [
			{ pkg: "effect", ceiling: "3.17.0", candidates: ["3.17.0"] },
			{ pkg: "@effect/cli", ceiling: "0.70.0", candidates: ["0.70.0"] },
		];
		const result = makeResult({
			resolved: new Map([
				["effect", "3.17.0"],
				["@effect/cli", "0.70.0"],
			]),
		});
		expect(reentryCandidates(members, result)).toEqual([]);
	});
});

const interopEntry = (o: Partial<CatalogEntry>): CatalogEntry => ({
	catalog: "effect",
	pkg: "@effect/cli",
	currentRange: "^0.71.0",
	operator: "^",
	rangeSpan: [10, 18],
	strategy: "interop",
	...o,
});

describe("interopEntryChanged", () => {
	it("is true when the resolved version differs from the source range", () => {
		const e = interopEntry({ currentRange: "^0.71.0" });
		const result = makeResult({ resolved: new Map([["@effect/cli", "0.70.0"]]) });
		expect(interopEntryChanged(e, result)).toBe(true);
	});

	it("is true when no peer literal exists yet but one will be inserted", () => {
		const e = interopEntry({ currentRange: "^0.71.0" });
		const result = makeResult({
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
		});
		expect(interopEntryChanged(e, result)).toBe(true);
	});

	it("is false when version and existing peer literal both match", () => {
		const e = interopEntry({
			currentRange: "^0.71.0",
			peer: { value: "^0.71.0", span: [30, 38] },
		});
		const result = makeResult({
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
		});
		expect(interopEntryChanged(e, result)).toBe(false);
	});

	it("is false when the member is not in the resolution", () => {
		const e = interopEntry({ pkg: "missing" });
		const result = makeResult({ resolved: new Map<string, string>() });
		expect(interopEntryChanged(e, result)).toBe(false);
	});
});

describe("buildInteropEdits", () => {
	it("emits a range edit when the resolved version differs", () => {
		const e = interopEntry({ currentRange: "^0.71.0", rangeSpan: [10, 18] });
		const result = makeResult({ resolved: new Map([["@effect/cli", "0.70.0"]]) });
		const edits = buildInteropEdits([e], result);
		expect(edits).toEqual([{ span: [10, 18], text: '"^0.70.0"' }]);
	});

	it("rewrites an existing peer literal when the derived peer differs", () => {
		const e = interopEntry({
			currentRange: "^0.71.0",
			rangeSpan: [10, 18],
			peer: { value: "^0.70.0", span: [30, 38] },
		});
		const result = makeResult({
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
		});
		const edits = buildInteropEdits([e], result);
		expect(edits).toEqual([{ span: [30, 38], text: '"^0.71.0"' }]);
	});

	it("inserts a peer literal at the range-span end when none exists", () => {
		const e = interopEntry({ currentRange: "^0.71.0", rangeSpan: [10, 18] });
		const result = makeResult({
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
		});
		const edits = buildInteropEdits([e], result);
		expect(edits).toEqual([{ span: [18, 18], text: ', peer: "^0.71.0"' }]);
	});

	it("emits both a range edit and a peer insert when both change", () => {
		const e = interopEntry({ currentRange: "^0.71.0", rangeSpan: [10, 18] });
		const result = makeResult({
			resolved: new Map([["@effect/cli", "0.70.0"]]),
			peers: new Map([["@effect/cli", "^0.70.0"]]),
		});
		const edits = buildInteropEdits([e], result);
		expect(edits).toEqual([
			{ span: [10, 18], text: '"^0.70.0"' },
			{ span: [18, 18], text: ', peer: "^0.70.0"' },
		]);
	});

	it("emits no edits when nothing changed", () => {
		const e = interopEntry({
			currentRange: "^0.71.0",
			rangeSpan: [10, 18],
			peer: { value: "^0.71.0", span: [30, 38] },
		});
		const result = makeResult({
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
		});
		expect(buildInteropEdits([e], result)).toEqual([]);
	});
});

describe("capVersions", () => {
	it("keeps only versions less than or equal to the cap", async () => {
		const out = await run(capVersions(["0.69.0", "0.70.0", "0.71.0", "0.72.0"], "0.70.0"));
		expect(out).toEqual(["0.69.0", "0.70.0"]);
	});

	it("returns the list unchanged when the cap is unparseable", async () => {
		const out = await run(capVersions(["0.70.0", "0.71.0"], "not-a-version"));
		expect(out).toEqual(["0.70.0", "0.71.0"]);
	});
});
