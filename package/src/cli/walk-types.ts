import type { PeerWarning } from "./peer-range.js";
import type { Candidate, CatalogEntry } from "./types.js";

/** One package's interactive choice surface. */
export interface WalkItem {
	readonly entry: CatalogEntry;
	/** Candidates from planEntry: [in-range?, latest?, keep] (keep always last). */
	readonly candidates: readonly Candidate[];
	/** True when the only candidate is keep (already at newest). */
	readonly upToDate: boolean;
	/** A peer range to resync to (existing peer literal drifted from strategy), else null. */
	readonly driftPeer: string | null;
	/** A peer range to MATERIALIZE (insert) when strategy is set but no peer literal exists, else null. */
	readonly materializePeer: string | null;
	/** An incompatibility between the entry's strategy and its pinned line, else null. */
	readonly peerWarning: PeerWarning | null;
}

/** The user's resolved choice for one item. */
export interface Decision {
	readonly item: WalkItem;
	readonly chosen: Candidate;
}
