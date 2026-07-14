import { Effect } from "effect";
import { describe, expect, it } from "vitest";
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

const run = (e: CatalogEntry) => Effect.runPromise(detectPeerDrift(e));

describe("detectPeerDrift", () => {
	it("returns the resync target when the materialized peer drifts from strategy", async () => {
		// current ^4.2.3 + lock-minor would yield ^4.2.0, but peer says ^4.1.0 → drift.
		const e = entry({ strategy: "lock-minor", peer: { value: "^4.1.0", span: [10, 18] } });
		await expect(run(e)).resolves.toBe("^4.2.0");
	});

	it("returns null when the peer already matches strategy", async () => {
		const e = entry({ strategy: "lock-minor", peer: { value: "^4.2.0", span: [10, 18] } });
		await expect(run(e)).resolves.toBeNull();
	});

	it("returns null when there is no strategy or no peer", async () => {
		await expect(run(entry({ peer: { value: "^4.2.0", span: [10, 18] } }))).resolves.toBeNull();
		await expect(run(entry({ strategy: "lock-minor" }))).resolves.toBeNull();
	});

	it("returns null for an interop entry (its peer is derived group-wise, never per-package)", async () => {
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
		await expect(run(e)).resolves.toBeNull();
	});

	it("reports NO drift when a prerelease peer already matches its lock strategy", async () => {
		const e = entry({
			pkg: "@changesets/cli",
			currentRange: "^3.0.0-next.8",
			rangeSpan: [0, 15],
			peer: { value: "^3.0.0-next.8", span: [20, 35] },
			strategy: "lock",
		});
		await expect(run(e)).resolves.toBeNull();
	});
});
