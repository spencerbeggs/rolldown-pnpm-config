/**
 * Tests proving that runInterop fetches peerDependencies lazily:
 *   - at most N calls for N members with no in-group conflicts (ceiling-only prefetch)
 *   - only on-demand lower-version calls when a conflict requires a downgrade
 *
 * These are the binding RED tests for the lazy-fetch refactor. The assertions
 * on call-count FAIL against the current eager implementation (which fetches
 * every candidate version ≤ ceiling up-front).
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runInterop } from "../../src/cli/interop.js";

const run = <A>(e: Effect.Effect<A, never>) => Effect.runPromise(e);

/** Build N versions from 1.0.0 up to 1.<N-1>.0. Last entry is the ceiling. */
function makeVersions(count: number): string[] {
	return Array.from({ length: count }, (_, i) => `1.${i}.0`);
}

// RED evidence (phase 8): current eager implementation fetches 250 times for N=5 members
// with 50 candidates each (5×50), and pre-fetches pkg-anchor@1.0.0/1.5.0 that are never
// consulted. Both assertions below fail against the current runInterop in interop.ts.
describe("runInterop — lazy peerDependencies fetching", () => {
	it("should call peerDependencies at most N times when N members have large candidate lists and no in-group conflicts", async () => {
		// Given
		const N = 5;
		const CANDIDATES_PER_MEMBER = 50; // 50 versions all ≤ ceiling
		const versions = makeVersions(CANDIDATES_PER_MEMBER); // ["1.0.0", ..., "1.49.0"]
		const ceiling = versions[versions.length - 1] as string; // "1.49.0"

		let callCount = 0;
		const resolver = {
			// No in-group peers returned — members are completely independent.
			// This means the ceiling-only prefetch is sufficient and no downgrade
			// search is ever triggered. The lazy implementation fetches exactly N
			// times; the eager implementation fetches N * CANDIDATES_PER_MEMBER.
			peerDependencies: (_pkg: string, _v: string): Effect.Effect<Record<string, string>, never> => {
				callCount++;
				return Effect.succeed({});
			},
		};

		const members = Array.from({ length: N }, (_, i) => ({
			pkg: `pkg-${i}`,
			ceiling,
			candidates: versions, // 50 candidates all ≤ ceiling
		}));

		// When
		await run(runInterop(members, resolver));

		// Then — lazy: only ceiling per member; eager: all candidates per member
		// Eager implementation fetches N * 50 = 250 times; this assertion fails against it.
		expect(callCount).toBeLessThanOrEqual(N);
	});

	it("should correctly downgrade a dependent when ceiling combination conflicts and fetch only the required lower-version peers on demand", async () => {
		// Given
		// anchor ceiling = 2.0.0; dep ceiling = 2.0.0
		// dep@2.0.0 requires anchor@^3.0.0 (can't be satisfied — anchor is capped at 2.0.0)
		// dep@1.0.0 requires anchor@^2.0.0 (satisfied by anchor@2.0.0: ^2.0.0 = >=2.0.0 <3.0.0)
		// anchor has 5 candidates all ≤ ceiling: 1.0.0 ... 2.0.0 (step 0.25 for variety)
		const anchorVersions = ["1.0.0", "1.5.0", "2.0.0"];
		const depVersions = ["1.0.0", "2.0.0"];

		const peers: Record<string, Record<string, Record<string, string>>> = {
			"pkg-anchor": {
				"1.0.0": {},
				"1.5.0": {},
				"2.0.0": {},
			},
			"pkg-dep": {
				// ^2.0.0 = >=2.0.0 <3.0.0 → satisfied by anchor@2.0.0 ✓
				"1.0.0": { "pkg-anchor": "^2.0.0" },
				// ^3.0.0 = >=3.0.0 <4.0.0 → NOT satisfied by anchor@2.0.0 ✗
				"2.0.0": { "pkg-anchor": "^3.0.0" },
			},
		};

		const fetched: string[] = [];
		const resolver = {
			peerDependencies: (pkg: string, v: string): Effect.Effect<Record<string, string>, never> => {
				fetched.push(`${pkg}@${v}`);
				return Effect.succeed(peers[pkg]?.[v] ?? {});
			},
		};

		const members = [
			{ pkg: "pkg-anchor", ceiling: "2.0.0", candidates: anchorVersions },
			{ pkg: "pkg-dep", ceiling: "2.0.0", candidates: depVersions },
		];

		// When
		const result = await run(runInterop(members, resolver));

		// Then — correctness: dep must be downgraded to 1.0.0
		expect(result.resolved.get("pkg-dep")).toBe("1.0.0");
		expect(result.resolved.get("pkg-anchor")).toBe("2.0.0");
		expect(result.conflicts).toHaveLength(0);

		// Then — laziness: anchor@1.0.0 and anchor@1.5.0 are NEVER fetched eagerly.
		// Only ceilings (anchor@2.0.0, dep@2.0.0) are prefetched.
		// dep@1.0.0 is fetched on-demand during the downgrade search.
		// That is 3 fetches total. The eager implementation fetches all 5 candidates
		// (3 anchor + 2 dep), so it makes 5 calls — this assertion fails against it.
		const totalMembers = 2;
		// dep required 1 on-demand fetch (dep@1.0.0 during downgrade search)
		// anchor's lower versions (1.0.0, 1.5.0) must NOT be fetched
		expect(fetched).not.toContain("pkg-anchor@1.0.0");
		expect(fetched).not.toContain("pkg-anchor@1.5.0");
		// The total call count must be small: ≤ N+1 (N ceilings + 1 on-demand at most)
		expect(fetched.length).toBeLessThanOrEqual(totalMembers + 1);
	});
});
