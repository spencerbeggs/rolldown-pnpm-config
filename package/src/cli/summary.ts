import type { Decision } from "./walk-types.js";

/** One interop member pulled below the user's pick to satisfy the group. @internal */
export interface InteropAdjustment {
	readonly catalog: string;
	readonly pkg: string;
	readonly from: string;
	readonly to: string;
	readonly peer: string;
}
/** The interop section of an interactive summary: adjustments + unresolved conflicts. @internal */
export interface InteropSummary {
	readonly adjustments: readonly InteropAdjustment[];
	readonly conflicts: readonly { readonly pkg: string; readonly ceiling: string; readonly blockedBy: string }[];
}

/**
 * Render a human-readable diff of the pending decisions: one line per real
 * change, peer changes indented, ending with an update/major/up-to-date tally.
 * When an interop section is supplied, append `↓ adjusted` and `⚠ conflict`
 * lines below the tally.
 *
 * @internal
 */
export function renderSummary(decisions: readonly Decision[], interop?: InteropSummary): string {
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
	if (interop) {
		for (const a of interop.adjustments) {
			lines.push(`  ↓ ${a.pkg}  ${a.from} → ${a.to}`);
			lines.push(`    ↳ peer  → ${a.peer}`);
		}
		for (const c of interop.conflicts) {
			lines.push(`  ⚠ ${c.pkg} (kept ${c.ceiling}) blocked by ${c.blockedBy}`);
		}
	}
	return lines.join("\n");
}
