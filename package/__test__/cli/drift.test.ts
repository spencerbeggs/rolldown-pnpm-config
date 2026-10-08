import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { detectPeerDrift } from "../../src/cli/drift.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
	catalog: "silk",
	pkg: "vitest",
	currentRange: "^4.2.3",
	operator: "^",
	rangeSpan: [0, 8],
	...over,
});

const run = (e: CatalogEntry) => detectPeerDrift(e);

describe("detectPeerDrift", () => {
	it.effect("returns the resync target when the materialized peer drifts from strategy", () =>
		Effect.gen(function* () {
			// current ^4.2.3 + lock-minor would yield ^4.2.0, but peer says ^4.1.0 → drift.
			const e = entry({ strategy: "lock-minor", peer: { value: "^4.1.0", span: [10, 18] } });
			expect(yield* run(e)).toBe("^4.2.0");
		}),
	);

	it.effect("returns null when the peer already matches strategy", () =>
		Effect.gen(function* () {
			const e = entry({ strategy: "lock-minor", peer: { value: "^4.2.0", span: [10, 18] } });
			expect(yield* run(e)).toBeNull();
		}),
	);

	it.effect("returns null when there is no strategy or no peer", () =>
		Effect.gen(function* () {
			expect(yield* run(entry({ peer: { value: "^4.2.0", span: [10, 18] } }))).toBeNull();
			expect(yield* run(entry({ strategy: "lock-minor" }))).toBeNull();
		}),
	);

	it.effect("returns null for an interop entry (its peer is derived group-wise, never per-package)", () =>
		Effect.gen(function* () {
			// An interop peer is the FLOOR the group's peerDependencies resolve to, computed
			// by interop.ts across the whole catalog group. Deriving one here would fall
			// through to the lock-minor branch and report a bogus resync (^3.17.0), which
			// projectDecisions would then surface in --preview/--dry-run.
			const e = entry({
				pkg: "effect",
				currentRange: "^3.17.0",
				peer: { value: "^3.16.0", span: [10, 18] },
				strategy: "interop",
			});
			expect(yield* run(e)).toBeNull();
		}),
	);

	it.effect("reports NO drift when a prerelease peer already matches its lock strategy", () =>
		Effect.gen(function* () {
			const e = entry({
				pkg: "@changesets/cli",
				currentRange: "^3.0.0-next.8",
				rangeSpan: [0, 15],
				peer: { value: "^3.0.0-next.8", span: [20, 35] },
				strategy: "lock",
			});
			expect(yield* run(e)).toBeNull();
		}),
	);
});
