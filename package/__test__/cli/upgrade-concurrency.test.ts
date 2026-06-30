/**
 * Concurrency unit tests for resolveGatedVersions and computeGate.
 *
 * resolveGatedVersions tests MUST fail against the sequential for...of implementation
 * (max in-flight === 1) and pass after the Effect.forEach + bounded-concurrency
 * refactor (max in-flight > 1, <= RESOLVE_CONCURRENCY).
 *
 * computeGate tests MUST fail against the sequential yield* + yield* pattern
 * (max in-flight === 1) and pass after Effect.all parallelization
 * (max in-flight === 2).
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { computeGate, resolveGatedVersions } from "../../src/cli/commands/upgrade.js";
import type { ReleaseAgeGate } from "../../src/cli/release-age.js";
import type { CatalogEntry } from "../../src/cli/types.js";

/** The concurrency limit the production code exports / uses. Must match the constant in upgrade.ts. */
const RESOLVE_CONCURRENCY = 12;

/** Number of packages — deliberately exceeds the limit so the bound is observable. */
const PACKAGE_COUNT = 15;

/** Track peak concurrent in-flight calls across async boundaries. */
function makeConcurrencyTracker() {
	let inFlight = 0;
	let maxInFlight = 0;
	return {
		enter() {
			inFlight++;
			if (inFlight > maxInFlight) maxInFlight = inFlight;
		},
		exit() {
			inFlight--;
		},
		get max() {
			return maxInFlight;
		},
	};
}

/** Build N distinct CatalogEntry objects, one per unique package. */
function makeEntries(count: number): CatalogEntry[] {
	return Array.from({ length: count }, (_, i) => ({
		catalog: "test",
		pkg: `pkg-${i}`,
		currentRange: "^1.0.0",
		operator: "^" as const,
		rangeSpan: [i * 30, i * 30 + 8] as unknown as readonly [number, number],
	}));
}

describe("resolveGatedVersions (concurrency)", () => {
	it("should fetch packages concurrently and respect the concurrency bound", async () => {
		// Given: a deferred resolver that tracks how many fetches are in-flight simultaneously.
		// Effect.async defers resume to the next event loop iteration via setImmediate so
		// the runtime can start all N concurrent fibers before any of them resolves.
		// With the current sequential for...of the peak stays at 1; after the concurrent
		// Effect.forEach refactor it must reach > 1 (and stay ≤ RESOLVE_CONCURRENCY).
		const tracker = makeConcurrencyTracker();

		const resolver = {
			versions: (_pkg: string) => {
				tracker.enter();
				return Effect.async<string[], never>((resume) => {
					setImmediate(() => {
						tracker.exit();
						resume(Effect.succeed(["1.0.0"]));
					});
				});
			},
			times: (_pkg: string) => Effect.succeed<Record<string, string>>({}),
			pnpmConfig: (_key: string) => Effect.succeed<string | null>(null),
			peerDependencies: (_pkg: string, _version: string) => Effect.succeed<Record<string, string>>({}),
		};

		// ageMinutes: 0 → filterByReleaseAge passes all versions through without filtering
		const gate: ReleaseAgeGate = { ageMinutes: 0, exclude: [] };
		const entries = makeEntries(PACKAGE_COUNT);

		// When: resolveGatedVersions is called
		const result = await Effect.runPromise(resolveGatedVersions(entries, resolver, gate, Date.now()));

		// Then: every package resolved to its correct version list
		expect(result.size).toBe(PACKAGE_COUNT);
		for (let i = 0; i < PACKAGE_COUNT; i++) {
			expect(result.get(`pkg-${i}`), `pkg-${i} should have resolved versions`).toEqual(["1.0.0"]);
		}

		// And: concurrency was OBSERVED — max > 1 proves fetches ran in parallel
		// (fails on the current sequential impl where max === 1)
		expect(tracker.max, `expected concurrent fetches but max in-flight was ${tracker.max}`).toBeGreaterThan(1);

		// And: concurrency was BOUNDED — max ≤ RESOLVE_CONCURRENCY
		expect(
			tracker.max,
			`max in-flight (${tracker.max}) exceeds the concurrency limit (${RESOLVE_CONCURRENCY})`,
		).toBeLessThanOrEqual(RESOLVE_CONCURRENCY);
	});
});

describe("resolveGatedVersions (fail-closed semantics)", () => {
	it("should return empty array for a package whose versions fetch fails", async () => {
		// Given: a resolver where one package's versions fetch fails
		const resolver = {
			versions: (pkg: string) =>
				pkg === "bad-pkg" ? Effect.fail(new Error("registry down")) : Effect.succeed(["1.0.0"]),
			times: (_pkg: string) => Effect.succeed<Record<string, string>>({}),
			pnpmConfig: (_key: string) => Effect.succeed<string | null>(null),
			peerDependencies: (_pkg: string, _version: string) => Effect.succeed<Record<string, string>>({}),
		};
		const gate: ReleaseAgeGate = { ageMinutes: 0, exclude: [] };
		const entries: CatalogEntry[] = [
			{
				catalog: "test",
				pkg: "good-pkg",
				currentRange: "^1.0.0",
				operator: "^",
				rangeSpan: [0, 8] as unknown as readonly [number, number],
			},
			{
				catalog: "test",
				pkg: "bad-pkg",
				currentRange: "^2.0.0",
				operator: "^",
				rangeSpan: [10, 18] as unknown as readonly [number, number],
			},
		];

		// When
		const result = await Effect.runPromise(resolveGatedVersions(entries, resolver, gate, Date.now()));

		// Then: good-pkg has its versions, bad-pkg gets an empty array (fail-closed)
		expect(result.get("good-pkg")).toEqual(["1.0.0"]);
		expect(result.get("bad-pkg")).toEqual([]);
	});

	it("should drop all versions when the times fetch fails (gate > 0)", async () => {
		// Given: a resolver where times fetch always fails, and a non-zero age gate
		const resolver = {
			versions: (_pkg: string) => Effect.succeed(["1.0.0", "2.0.0"]),
			times: (_pkg: string) => Effect.fail(new Error("times unavailable")),
			pnpmConfig: (_key: string) => Effect.succeed<string | null>(null),
			peerDependencies: (_pkg: string, _version: string) => Effect.succeed<Record<string, string>>({}),
		};
		// gate.ageMinutes > 0 means times data is required for filtering
		const gate: ReleaseAgeGate = { ageMinutes: 1440, exclude: [] };
		const entries: CatalogEntry[] = [
			{
				catalog: "test",
				pkg: "some-pkg",
				currentRange: "^1.0.0",
				operator: "^",
				rangeSpan: [0, 8] as unknown as readonly [number, number],
			},
		];

		// When
		const result = await Effect.runPromise(resolveGatedVersions(entries, resolver, gate, Date.now()));

		// Then: fail-closed — empty times map makes filterByReleaseAge drop every version
		expect(result.get("some-pkg")).toEqual([]);
	});
});

import type { GroupMember } from "../../src/cli/interop.js";
import { runInterop } from "../../src/cli/interop.js";

// RED: current computeGate issues the two pnpmConfig calls sequentially (max in-flight=1).
// GREEN target: Effect.all([...], { concurrency: "unbounded" }) makes them overlap (max=2).
describe("computeGate (pnpmConfig concurrency)", () => {
	it("should issue both pnpmConfig calls concurrently", async () => {
		// Given: a deferred pnpmConfig resolver that records in-flight call count.
		// The two calls (minimumReleaseAge + minimumReleaseAgeExclude) are independent.
		// With sequential yield* + yield* each waits for the other to finish → max in-flight=1.
		// After Effect.all parallelization both run simultaneously → max in-flight=2.
		const tracker = makeConcurrencyTracker();

		// A minimal source that evaluates to a valid (but empty) PnpmConfigPlugin call.
		// computeGate calls evaluatePluginConfig on this; returning no releaseAge from the
		// config is fine — we're only testing the pnpmConfig concurrency path.
		const source = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: {} });`;

		const resolver = {
			versions: (_pkg: string) => Effect.succeed<string[]>([]),
			times: (_pkg: string) => Effect.succeed<Record<string, string>>({}),
			peerDependencies: (_pkg: string, _version: string) => Effect.succeed<Record<string, string>>({}),
			pnpmConfig: (_key: string) => {
				tracker.enter();
				return Effect.async<string | null, never>((resume) => {
					setImmediate(() => {
						tracker.exit();
						resume(Effect.succeed(null));
					});
				});
			},
		};

		// When
		await Effect.runPromise(computeGate(source, "test.ts", resolver));

		// Then: both pnpmConfig calls ran concurrently (max in-flight === 2)
		// (fails when the calls are sequential — max in-flight would be 1)
		expect(
			tracker.max,
			`expected both pnpmConfig calls to overlap but max in-flight was ${tracker.max}`,
		).toBeGreaterThan(1);
	});
});

describe("runInterop (peerDependencies concurrency)", () => {
	it("should fetch peerDependencies concurrently and deduplicate via cache", async () => {
		// Given: 4 members, each with ceiling 2.0.0 and one extra candidate 1.0.0.
		// With lazy fetch, only ceiling versions are pre-fetched concurrently → 4 total
		// fetches. The 1.0.0 candidates are NOT pre-fetched because there are no
		// in-group cross-peerDependencies, so no downgrade search is triggered.
		// Concurrency: all 4 ceiling fetches run in parallel (max in-flight must be > 1).
		const tracker = makeConcurrencyTracker();
		let fetchCount = 0;

		// 4 members: pkg-a, pkg-b, pkg-c, pkg-d; no cross-peerDependencies so no downgrade logic
		const members: GroupMember[] = [
			{ pkg: "pkg-a", ceiling: "2.0.0", candidates: ["2.0.0", "1.0.0"] },
			{ pkg: "pkg-b", ceiling: "2.0.0", candidates: ["2.0.0", "1.0.0"] },
			{ pkg: "pkg-c", ceiling: "2.0.0", candidates: ["2.0.0", "1.0.0"] },
			{ pkg: "pkg-d", ceiling: "2.0.0", candidates: ["2.0.0", "1.0.0"] },
		];

		const resolver = {
			peerDependencies: (_pkg: string, _version: string) => {
				tracker.enter();
				fetchCount++;
				return Effect.async<Record<string, string>, never>((resume) => {
					setImmediate(() => {
						tracker.exit();
						resume(Effect.succeed({}));
					});
				});
			},
		};

		// When
		await Effect.runPromise(runInterop(members, resolver));

		// Then: peerDependencies were fetched concurrently (max in-flight > 1)
		// All 4 ceiling fetches are fired concurrently via Effect.forEach.
		expect(tracker.max, `expected concurrent peerDeps fetches but max in-flight was ${tracker.max}`).toBeGreaterThan(1);

		// And: only ceiling versions were fetched — lazy fetch skips candidate 1.0.0
		// because no in-group conflict triggered a downgrade search.
		// 1 ceiling × 4 members = 4 total fetches (not 8 as in the old eager impl).
		expect(fetchCount, "each (pkg, version) pair should be fetched exactly once").toBe(4);
	});

	it("should reuse cache entries and not re-fetch across calls", async () => {
		// Given: a shared cache with pre-populated entry for pkg-a@2.0.0
		let fetchCount = 0;
		const cache = new Map<string, Record<string, string>>();
		cache.set("pkg-a@2.0.0", { "pkg-b": "^1.0.0" });

		const resolver = {
			peerDependencies: (_pkg: string, _version: string) => {
				fetchCount++;
				return Effect.succeed<Record<string, string>>({});
			},
		};

		const members: GroupMember[] = [{ pkg: "pkg-a", ceiling: "2.0.0", candidates: ["2.0.0"] }];

		// When
		await Effect.runPromise(runInterop(members, resolver, cache));

		// Then: pkg-a@2.0.0 was already in cache — no fetch occurred
		expect(fetchCount, "should not re-fetch a cached (pkg, version) pair").toBe(0);
	});
});
