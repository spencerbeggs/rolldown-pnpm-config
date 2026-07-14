import type { PlannedEdit } from "./types.js";
import type { Decision } from "./walk-types.js";

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
		const pkg = entry.pkg;
		const insertAt = entry.rangeSpan[1];
		const range = (span: readonly [number, number], value: string): PlannedEdit => ({
			span,
			text: JSON.stringify(value),
			pkg,
			kind: "range",
			value,
		});
		const peer = (span: readonly [number, number], value: string): PlannedEdit => ({
			span,
			text: JSON.stringify(value),
			pkg,
			kind: "peer",
			value,
		});
		const peerInsert = (value: string): PlannedEdit => ({
			span: [insertAt, insertAt],
			text: `, peer: ${JSON.stringify(value)}`,
			pkg,
			kind: "peer",
			value,
		});

		if (chosen.kind !== "keep") {
			edits.push(range(entry.rangeSpan, chosen.range));
			if (entry.peer && chosen.peerRange) {
				edits.push(peer(entry.peer.span, chosen.peerRange));
			} else if (!entry.peer && entry.strategy && chosen.peerRange) {
				edits.push(peerInsert(chosen.peerRange));
			}
		} else if (entry.peer && item.driftPeer) {
			edits.push(peer(entry.peer.span, item.driftPeer));
		} else if (!entry.peer && item.materializePeer) {
			edits.push(peerInsert(item.materializePeer));
		}
	}
	return edits;
}
