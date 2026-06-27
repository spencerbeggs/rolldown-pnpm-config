import type { Decision } from "./walk-types.js";

/**
 * Render a human-readable diff of the pending decisions: one line per real
 * change, peer changes indented, ending with an update/major/up-to-date tally.
 *
 * @internal
 */
export function renderSummary(decisions: readonly Decision[]): string {
	const lines: string[] = [];
	let toUpdate = 0;
	let major = 0;
	let resync = 0;
	let materialize = 0;
	let upToDate = 0;
	for (const { item, chosen } of decisions) {
		const { entry } = item;
		if (chosen.kind !== "keep") {
			toUpdate++;
			if (chosen.isMajor) major++;
			lines.push(`  ${entry.catalog} › ${entry.pkg}  ${entry.currentRange} → ${chosen.range}`);
			if (entry.peer && chosen.peerRange && chosen.peerRange !== entry.peer.value) {
				lines.push(`    ↳ peer  ${entry.peer.value} → ${chosen.peerRange}`);
			} else if (!entry.peer && entry.strategy && chosen.peerRange) {
				lines.push(`    ↳ peer (new)  → ${chosen.peerRange}`);
				materialize++;
			}
		} else if (entry.peer && item.driftPeer) {
			resync++;
			lines.push(`  ${entry.catalog} › ${entry.pkg}  (resync peer)`);
			lines.push(`    ↳ peer  ${entry.peer.value} → ${item.driftPeer}`);
		} else if (!entry.peer && item.materializePeer) {
			materialize++;
			lines.push(`  ${entry.catalog} › ${entry.pkg}  (materialize peer)`);
			lines.push(`    ↳ peer (new)  → ${item.materializePeer}`);
		} else {
			upToDate++;
		}
	}
	lines.push(
		`${toUpdate} to update · ${major} major · ${resync} resync · ${materialize} new peer · ${upToDate} up to date`,
	);
	return lines.join("\n");
}
