import type { Edit } from "./types.js";
import type { Decision } from "./walk-types.js";

/**
 * Convert resolved decisions into span edits. A chosen upgrade rewrites the
 * range literal (and the existing peer literal when the candidate carries a
 * recomputed peerRange). A keep with peer drift rewrites only the peer literal
 * to the resync target.
 *
 * @internal
 */
export function buildEdits(decisions: readonly Decision[]): Edit[] {
	const edits: Edit[] = [];
	for (const { item, chosen } of decisions) {
		const { entry } = item;
		const insertAt = entry.rangeSpan[1];
		if (chosen.kind !== "keep") {
			edits.push({ span: entry.rangeSpan, text: JSON.stringify(chosen.range) });
			if (entry.peer && chosen.peerRange) {
				edits.push({ span: entry.peer.span, text: JSON.stringify(chosen.peerRange) });
			} else if (!entry.peer && entry.strategy && chosen.peerRange) {
				edits.push({ span: [insertAt, insertAt], text: `, peer: ${JSON.stringify(chosen.peerRange)}` });
			}
		} else if (entry.peer && item.driftPeer) {
			edits.push({ span: entry.peer.span, text: JSON.stringify(item.driftPeer) });
		} else if (!entry.peer && item.materializePeer) {
			edits.push({ span: [insertAt, insertAt], text: `, peer: ${JSON.stringify(item.materializePeer)}` });
		}
	}
	return edits;
}
