import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { InteropResult } from "../../src/cli/interop.js";
import {
	affectedReentry,
	buildInteropEdits,
	capVersions,
	deriveFloors,
	interopEntryChanged,
	resolveGroup,
	runInterop,
} from "../../src/cli/interop.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const run = <A>(e: Effect.Effect<A, never>) => Effect.runPromise(e);

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
		const out = await run(deriveFloors(resolved, (pkg) => peers[pkg] ?? {}));
		// effect floor = lowest of {3.17.0 (platform), 3.16.0 (cli)} = 3.16.0
		expect(out.get("effect")).toBe("^3.16.0");
		expect(out.get("@effect/platform")).toBe("^0.90.0");
		// cli: nobody peer-depends on it → fall back to its resolved version
		expect(out.get("@effect/cli")).toBe("^0.70.1");
	});

	it("ignores out-of-group peer dependencies", async () => {
		const resolved = new Map([["effect", "3.17.2"]]);
		const out = await run(deriveFloors(resolved, () => ({ react: "^18.0.0" })));
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
	const lookup = (pkg: string, v: string) => peers[pkg]?.[v] ?? {};

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
	});
});

describe("affectedReentry", () => {
	it("flags members downgraded below their ceiling and members in conflict", () => {
		const members = [
			{ pkg: "effect", ceiling: "3.17.0", candidates: ["3.17.0"] },
			{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.70.0", "0.71.0"] },
		];
		const result: InteropResult = {
			resolved: new Map([
				["effect", "3.17.0"],
				["@effect/cli", "0.70.0"],
			]),
			peers: new Map<string, string>(),
			conflicts: [],
		};
		const out = affectedReentry(members, result);
		expect(out).toEqual([{ pkg: "@effect/cli", cappedVersion: "0.70.0" }]);
	});

	it("flags a conflicted member even when its resolved version equals its ceiling", () => {
		const members = [{ pkg: "@effect/cli", ceiling: "0.71.0", candidates: ["0.71.0"] }];
		const result: InteropResult = {
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map<string, string>(),
			conflicts: [{ pkg: "@effect/cli", ceiling: "0.71.0", blockedBy: "effect@^3.18.0" }],
		};
		expect(affectedReentry(members, result)).toEqual([{ pkg: "@effect/cli", cappedVersion: "0.71.0" }]);
	});

	it("flags nothing when every member resolves at its ceiling without conflict", () => {
		const members = [
			{ pkg: "effect", ceiling: "3.17.0", candidates: ["3.17.0"] },
			{ pkg: "@effect/cli", ceiling: "0.70.0", candidates: ["0.70.0"] },
		];
		const result: InteropResult = {
			resolved: new Map([
				["effect", "3.17.0"],
				["@effect/cli", "0.70.0"],
			]),
			peers: new Map<string, string>(),
			conflicts: [],
		};
		expect(affectedReentry(members, result)).toEqual([]);
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
		const result: InteropResult = {
			resolved: new Map([["@effect/cli", "0.70.0"]]),
			peers: new Map<string, string>(),
			conflicts: [],
		};
		expect(interopEntryChanged(e, result)).toBe(true);
	});

	it("is true when no peer literal exists yet but one will be inserted", () => {
		const e = interopEntry({ currentRange: "^0.71.0" });
		const result: InteropResult = {
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
			conflicts: [],
		};
		expect(interopEntryChanged(e, result)).toBe(true);
	});

	it("is false when version and existing peer literal both match", () => {
		const e = interopEntry({
			currentRange: "^0.71.0",
			peer: { value: "^0.71.0", span: [30, 38] },
		});
		const result: InteropResult = {
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
			conflicts: [],
		};
		expect(interopEntryChanged(e, result)).toBe(false);
	});

	it("is false when the member is not in the resolution", () => {
		const e = interopEntry({ pkg: "missing" });
		const result: InteropResult = {
			resolved: new Map<string, string>(),
			peers: new Map<string, string>(),
			conflicts: [],
		};
		expect(interopEntryChanged(e, result)).toBe(false);
	});
});

describe("buildInteropEdits", () => {
	it("emits a range edit when the resolved version differs", () => {
		const e = interopEntry({ currentRange: "^0.71.0", rangeSpan: [10, 18] });
		const result: InteropResult = {
			resolved: new Map([["@effect/cli", "0.70.0"]]),
			peers: new Map<string, string>(),
			conflicts: [],
		};
		const edits = buildInteropEdits([e], result);
		expect(edits).toEqual([{ span: [10, 18], text: '"^0.70.0"' }]);
	});

	it("rewrites an existing peer literal when the derived peer differs", () => {
		const e = interopEntry({
			currentRange: "^0.71.0",
			rangeSpan: [10, 18],
			peer: { value: "^0.70.0", span: [30, 38] },
		});
		const result: InteropResult = {
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
			conflicts: [],
		};
		const edits = buildInteropEdits([e], result);
		expect(edits).toEqual([{ span: [30, 38], text: '"^0.71.0"' }]);
	});

	it("inserts a peer literal at the range-span end when none exists", () => {
		const e = interopEntry({ currentRange: "^0.71.0", rangeSpan: [10, 18] });
		const result: InteropResult = {
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
			conflicts: [],
		};
		const edits = buildInteropEdits([e], result);
		expect(edits).toEqual([{ span: [18, 18], text: ', peer: "^0.71.0"' }]);
	});

	it("emits both a range edit and a peer insert when both change", () => {
		const e = interopEntry({ currentRange: "^0.71.0", rangeSpan: [10, 18] });
		const result: InteropResult = {
			resolved: new Map([["@effect/cli", "0.70.0"]]),
			peers: new Map([["@effect/cli", "^0.70.0"]]),
			conflicts: [],
		};
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
		const result: InteropResult = {
			resolved: new Map([["@effect/cli", "0.71.0"]]),
			peers: new Map([["@effect/cli", "^0.71.0"]]),
			conflicts: [],
		};
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
