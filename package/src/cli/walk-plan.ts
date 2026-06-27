import { Effect } from "effect";
import { detectPeerDrift } from "./drift.js";
import type { PeerRangeError } from "./peer-range.js";
import { derivePeerRange } from "./peer-range.js";
import { planEntry } from "./plan.js";
import type { CatalogEntry } from "./types.js";
import type { WalkItem } from "./walk-types.js";

/**
 * Build the interactive walk items: for each entry, its candidate list (from
 * planEntry against the resolved versions), an up-to-date flag (only the keep
 * candidate remains), and any peer drift resync target.
 *
 * @internal
 */
export function buildWalkItems(
	entries: readonly CatalogEntry[],
	versionsByPkg: ReadonlyMap<string, readonly string[]>,
): Effect.Effect<WalkItem[], PeerRangeError> {
	return Effect.gen(function* () {
		const items: WalkItem[] = [];
		for (const entry of entries) {
			const versions = versionsByPkg.get(entry.pkg) ?? [];
			const candidates = yield* planEntry(entry, [...versions]);
			const driftPeer = yield* detectPeerDrift(entry);
			const materializePeer =
				entry.strategy && !entry.peer ? yield* derivePeerRange(entry.currentRange, entry.strategy) : null;
			const upToDate = candidates.length === 1 && driftPeer === null && materializePeer === null;
			items.push({ entry, candidates, upToDate, driftPeer, materializePeer });
		}
		return items;
	});
}
