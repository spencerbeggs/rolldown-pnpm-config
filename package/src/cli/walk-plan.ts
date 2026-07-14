import { Effect } from "effect";
import { detectPeerDrift } from "./drift.js";
import type { PeerRangeError, PeerWarning } from "./peer-range.js";
import { derivePeerRange } from "./peer-range.js";
import { planEntry } from "./plan.js";
import type { CatalogEntry } from "./types.js";
import type { WalkItem } from "./walk-types.js";

/**
 * Build the interactive walk items: for each entry, its candidate list (from
 * planEntry against the resolved versions), an up-to-date flag (only the keep
 * candidate remains), any peer drift resync target, any peer to materialize,
 * and any strategy/prerelease incompatibility warning.
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
			let peerWarning: PeerWarning | null = null;
			let materializePeer: string | null = null;
			if (entry.strategy && entry.strategy !== "interop") {
				const derived = yield* derivePeerRange(entry.currentRange, entry.strategy);
				peerWarning = derived.warning;
				if (!entry.peer) materializePeer = derived.range;
			}
			const upToDate = candidates.length === 1 && driftPeer === null && materializePeer === null;
			items.push({ entry, candidates, upToDate, driftPeer, materializePeer, peerWarning });
		}
		return items;
	});
}
