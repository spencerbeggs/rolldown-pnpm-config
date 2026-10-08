import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { planEntry } from "../../src/cli/plan.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
	catalog: "silk",
	pkg: "typescript",
	currentRange: "^5.9.0",
	operator: "^",
	rangeSpan: [0, 8],
	...over,
});

const run = (e: CatalogEntry, versions: string[]) => planEntry(e, versions);

describe("planEntry", () => {
	it.effect("offers latest in-range and latest overall, preserving the operator", () =>
		Effect.gen(function* () {
			const c = yield* run(entry(), ["5.9.0", "5.9.3", "5.9.5-beta.1", "6.0.0", "7.1.0"]);
			expect(c.map((x) => [x.kind, x.range, x.isMajor])).toEqual([
				["in-range", "^5.9.3", false],
				["latest", "^7.1.0", true],
				["keep", "^5.9.0", false],
			]);
		}),
	);

	it.effect("offers the latest same-major version between the caret range and the next major (0.x)", () =>
		Effect.gen(function* () {
			// ^0.49.0 locks the minor (>=0.49.0 <0.50.0), so 0.50.0 is out of range but is
			// the meaningful intermediate below the 1.0 major — it must be offered.
			const c = yield* run(entry({ currentRange: "^0.49.0", rangeSpan: [0, 8] }), ["0.49.0", "0.50.0", "1.0.0"]);
			expect(c.map((x) => [x.kind, x.range, x.isMajor])).toEqual([
				["minor", "^0.50.0", false],
				["latest", "^1.0.0", true],
				["keep", "^0.49.0", false],
			]);
		}),
	);

	it.effect("does not add a minor tier when the caret already spans the whole major (1.x)", () =>
		Effect.gen(function* () {
			const c = yield* run(entry({ currentRange: "^1.2.0", rangeSpan: [0, 8] }), ["1.2.0", "1.9.0", "2.0.0"]);
			expect(c.map((x) => x.kind)).toEqual(["in-range", "latest", "keep"]);
			expect(c.find((x) => x.kind === "in-range")?.version).toBe("1.9.0");
		}),
	);

	it.effect("returns only keep when already at the newest stable version", () =>
		Effect.gen(function* () {
			const c = yield* run(entry({ currentRange: "^7.1.0", rangeSpan: [0, 8] }), ["7.1.0"]);
			expect(c.map((x) => x.kind)).toEqual(["keep"]);
		}),
	);

	it.effect("does not offer a downgrade when the config is pinned ahead of the registry", () =>
		Effect.gen(function* () {
			const c = yield* run(entry({ currentRange: "^5.9.5", rangeSpan: [0, 8] }), ["5.9.0", "5.9.3"]);
			expect(c.map((x) => x.kind)).toEqual(["keep"]);
		}),
	);

	it.effect("attaches a recomputed peerRange when the entry has a strategy", () =>
		Effect.gen(function* () {
			const c = yield* run(
				entry({ currentRange: "^4.0.0", strategy: "lock-minor", peer: { value: "^4.0.0", span: [0, 8] } }),
				["4.0.0", "4.2.3"],
			);
			const inRange = c.find((x) => x.kind === "in-range");
			expect(inRange?.range).toBe("^4.2.3");
			expect(inRange?.peerRange).toBe("^4.2.0");
			const keep = c.find((x) => x.kind === "keep");
			expect(keep?.peerRange).toBeUndefined();
		}),
	);

	it.effect("does not attach a peerRange to interop candidates (deferred to the group pass)", () =>
		Effect.gen(function* () {
			const entry = {
				catalog: "effect",
				pkg: "effect",
				currentRange: "^3.16.0",
				operator: "^" as const,
				rangeSpan: [0, 8] as [number, number],
				strategy: "interop" as const,
			};
			const candidates = yield* planEntry(entry, ["3.16.0", "3.17.0"]);
			expect(candidates.every((c) => c.peerRange === undefined)).toBe(true);
		}),
	);

	it.effect("offers same-track prerelease candidates when the entry is already on a prerelease", () =>
		Effect.gen(function* () {
			const candidates = yield* run(
				entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }),
				["2.29.0", "3.0.0-next.8", "3.0.0-next.9", "3.0.0-alpha.1"],
			);
			const inRange = candidates.find((c) => c.kind === "in-range");
			expect(inRange?.range).toBe("^3.0.0-next.9");
		}),
	);

	it.effect("does not offer an off-track prerelease", () =>
		Effect.gen(function* () {
			// "zzz" sorts above "next" lexically, so the off-track candidate would win
			// the in-range slot if `onTrack` were not filtering it out. This fails
			// pre-fix (no in-range candidate at all) and fails if `onTrack` is removed
			// (in-range becomes ^3.0.0-zzz.1 instead of ^3.0.0-next.9).
			const candidates = yield* run(
				entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }),
				["3.0.0-next.8", "3.0.0-next.9", "3.0.0-zzz.1"],
			);
			const inRange = candidates.find((c) => c.kind === "in-range");
			expect(inRange?.range).toBe("^3.0.0-next.9");
		}),
	);

	it.effect("prefers the stable line once it ships over a same-track prerelease", () =>
		Effect.gen(function* () {
			const withStable = yield* run(
				entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }),
				["3.0.0-next.8", "3.0.0-next.9", "3.0.0"],
			);
			expect(withStable.find((c) => c.kind === "in-range")?.range).toBe("^3.0.0");

			// Same entry with the stable version removed: the same-track prerelease
			// must win, proving the stable line above outranks it rather than merely
			// being the only survivor.
			const withoutStable = yield* run(
				entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }),
				["3.0.0-next.8", "3.0.0-next.9"],
			);
			expect(withoutStable.find((c) => c.kind === "in-range")?.range).toBe("^3.0.0-next.9");
		}),
	);

	it.effect("marks a same-track prerelease candidate as non-major and a stable cross-major candidate as major", () =>
		Effect.gen(function* () {
			const candidates = yield* run(
				entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }),
				["3.0.0-next.8", "3.0.0-next.9", "4.0.0"],
			);
			const inRange = candidates.find((c) => c.kind === "in-range");
			expect(inRange?.range).toBe("^3.0.0-next.9");
			expect(inRange?.isMajor).toBe(false);
			const latest = candidates.find((c) => c.kind === "latest");
			expect(latest?.range).toBe("^4.0.0");
			expect(latest?.isMajor).toBe(true);
		}),
	);

	it.effect("never offers a prerelease to an entry on a stable range", () =>
		Effect.gen(function* () {
			const candidates = yield* run(entry({ pkg: "effect", currentRange: "^3.21.4", rangeSpan: [0, 9] }), [
				"3.21.4",
				"3.21.5",
				"3.22.0-next.1",
			]);
			expect(candidates.map((c) => c.range)).not.toContain("^3.22.0-next.1");
			expect(candidates.find((c) => c.kind === "in-range")?.range).toBe("^3.21.5");
		}),
	);
});
