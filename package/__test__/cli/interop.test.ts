import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { deriveFloors, resolveGroup } from "../../src/cli/interop.js";

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
	});
});
