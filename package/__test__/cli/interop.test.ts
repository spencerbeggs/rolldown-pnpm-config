import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { deriveFloors } from "../../src/cli/interop.js";

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
