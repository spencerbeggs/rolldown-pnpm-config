import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { derivePeerRange } from "../../src/cli/peer-range.js";

const run = (range: string, strategy: "lock" | "lock-minor") => derivePeerRange(range, strategy);

describe("derivePeerRange", () => {
	it.effect("lock pins to the exact version, keeping the operator", () =>
		Effect.gen(function* () {
			expect(yield* run("^6.5.1", "lock")).toEqual({ range: "^6.5.1", warning: null });
			expect(yield* run("~6.5.1", "lock")).toEqual({ range: "~6.5.1", warning: null });
			expect(yield* run("6.5.1", "lock")).toEqual({ range: "6.5.1", warning: null });
		}),
	);

	it.effect("lock-minor floors the patch to .0, keeping the operator", () =>
		Effect.gen(function* () {
			expect(yield* run("^6.5.1", "lock-minor")).toEqual({ range: "^6.5.0", warning: null });
			expect(yield* run("~4.2.9", "lock-minor")).toEqual({ range: "~4.2.0", warning: null });
		}),
	);

	it.effect("lock preserves prerelease identifiers", () =>
		Effect.gen(function* () {
			expect(yield* run("^3.0.0-next.8", "lock")).toEqual({ range: "^3.0.0-next.8", warning: null });
			expect(yield* run("^1.0.0-beta.2", "lock")).toEqual({ range: "^1.0.0-beta.2", warning: null });
		}),
	);

	it.effect("lock preserves build metadata", () =>
		Effect.gen(function* () {
			expect(yield* run("^6.5.1+build.7", "lock")).toEqual({ range: "^6.5.1+build.7", warning: null });
		}),
	);

	it.effect("lock-minor floors a stable version and drops build metadata without warning", () =>
		Effect.gen(function* () {
			const result = yield* run("^6.5.1+build.7", "lock-minor");
			expect(result).toEqual({ range: "^6.5.0", warning: null });
		}),
	);

	it.effect("lock-minor degrades to lock on a prerelease and warns", () =>
		Effect.gen(function* () {
			const result = yield* run("^3.0.0-next.8", "lock-minor");
			expect(result.range).toBe("^3.0.0-next.8");
			expect(result.warning?.kind).toBe("lock-minor-prerelease");
			expect(result.warning?.message).toContain("3.0.0-next.8");
		}),
	);

	it.effect("fails on a range it cannot parse", () =>
		Effect.gen(function* () {
			expect((yield* Effect.exit(run(">=5 <6", "lock")))._tag).toBe("Failure");
		}),
	);
});
