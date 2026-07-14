import { Effect } from "effect";
import type { PeerRangeError } from "./peer-range.js";
import { derivePeerRange } from "./peer-range.js";
import type { CatalogEntry } from "./types.js";

/**
 * Detect whether an entry's materialized peer range has drifted from what its
 * strategy would produce from the CURRENT range. Returns the resync target (the
 * up-to-date peer range) on drift, or null when in sync or not applicable
 * (missing peer or strategy).
 *
 * "interop" is NOT a per-package derivation: an interop peer is computed
 * GROUP-WISE by `interop.ts` from the resolved peerDependencies of the whole
 * catalog group. Deriving one per package here would fall through to the
 * lock-minor branch and report a bogus resync target, so interop entries are
 * excluded — parity with `materializePeer` in walk-plan.ts.
 *
 * @internal
 */
export function detectPeerDrift(entry: CatalogEntry): Effect.Effect<string | null, PeerRangeError> {
	return Effect.gen(function* () {
		if (!entry.peer || !entry.strategy || entry.strategy === "interop") return null;
		const { range: expected } = yield* derivePeerRange(entry.currentRange, entry.strategy);
		return expected === entry.peer.value ? null : expected;
	});
}
