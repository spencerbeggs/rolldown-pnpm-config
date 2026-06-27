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
 * @internal
 */
export function detectPeerDrift(entry: CatalogEntry): Effect.Effect<string | null, PeerRangeError> {
	return Effect.gen(function* () {
		if (!entry.peer || !entry.strategy) return null;
		const expected = yield* derivePeerRange(entry.currentRange, entry.strategy);
		return expected === entry.peer.value ? null : expected;
	});
}
