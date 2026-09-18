import type { CatalogEntry, PlannedEdit } from "./types.js";
import { versionKeyOf } from "./version-key.js";
import type { Decision } from "./walk-types.js";

/** The span-edit constructors for one catalog entry. @internal */
export interface EntryEdits {
	/** Rewrite the range literal. */
	readonly range: (value: string) => PlannedEdit;
	/** Set the peer: rewrite the existing literal, or insert `, peer: "..."` after the range. */
	readonly setPeer: (value: string) => PlannedEdit;
}

/**
 * The edit constructors for one entry, each tagged with the entry's package
 * and route-aware version key so `validateEdits` can check it against the
 * registry before it is written. The single place that knows the insertion
 * syntax and the key routing — both the interactive and the `--yes` paths
 * build their edits through it.
 *
 * @internal
 */
export function entryEdits(entry: CatalogEntry): EntryEdits {
	const pkg = entry.pkg;
	const versionKey = versionKeyOf(entry);
	const insertAt = entry.rangeSpan[1];
	return {
		range: (value) => ({ span: entry.rangeSpan, text: JSON.stringify(value), pkg, versionKey, kind: "range", value }),
		setPeer: (value) =>
			entry.peer
				? { span: entry.peer.span, text: JSON.stringify(value), pkg, versionKey, kind: "peer", value }
				: {
						span: [insertAt, insertAt],
						text: `, peer: ${JSON.stringify(value)}`,
						pkg,
						versionKey,
						kind: "peer",
						value,
					},
	};
}

/**
 * Convert resolved decisions into span edits. A chosen upgrade rewrites the
 * range literal (and the existing peer literal when the candidate carries a
 * recomputed peerRange). A keep with peer drift rewrites only the peer literal
 * to the resync target.
 *
 * Each edit is tagged with its package and unquoted range so `validateEdits`
 * can check it against the registry before it is written.
 *
 * @internal
 */
export function buildEdits(decisions: readonly Decision[]): PlannedEdit[] {
	const edits: PlannedEdit[] = [];
	for (const { item, chosen } of decisions) {
		const { entry } = item;
		const { range, setPeer } = entryEdits(entry);

		if (chosen.kind !== "keep") {
			edits.push(range(chosen.range));
			// A recomputed peer is only carried by strategy entries; without a
			// strategy there is nothing to materialize.
			if (chosen.peerRange && (entry.peer || entry.strategy)) edits.push(setPeer(chosen.peerRange));
		} else if (entry.peer && item.driftPeer) {
			edits.push(setPeer(item.driftPeer));
		} else if (!entry.peer && item.materializePeer) {
			edits.push(setPeer(item.materializePeer));
		}
	}
	return edits;
}
