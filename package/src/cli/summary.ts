import { toAnsi } from "./ui/ansi.js";
import type { StyledLine } from "./ui/styled.js";
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
 * Build the pending-decisions summary as styled lines: one line per real
 * change, peer changes indented, a dim tally, then interop adjustments and
 * conflicts. Pure; color is applied by `renderSummary`/`toAnsi`.
 *
 * @internal
 */
export function summaryLines(decisions: readonly Decision[], interop?: InteropSummary): StyledLine[] {
	const lines: StyledLine[] = [];
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
			lines.push({
				indent: 0,
				gutter: "~",
				segments: [
					{ text: `${entry.catalog} › ${entry.pkg}  ${entry.currentRange} → ${chosen.range}`, style: "changed" },
				],
			});
			if (entry.peer && chosen.peerRange && chosen.peerRange !== entry.peer.value) {
				lines.push({
					indent: 1,
					gutter: "~",
					segments: [{ text: `↳ peer  ${entry.peer.value} → ${chosen.peerRange}`, style: "changed" }],
				});
			} else if (!entry.peer && entry.strategy && chosen.peerRange) {
				lines.push({
					indent: 1,
					gutter: "+",
					segments: [{ text: `↳ peer (new)  → ${chosen.peerRange}`, style: "added" }],
				});
				materialize++;
			}
		} else if (entry.peer && item.driftPeer) {
			resync++;
			lines.push({
				indent: 0,
				gutter: "~",
				segments: [{ text: `${entry.catalog} › ${entry.pkg}  (resync peer)`, style: "changed" }],
			});
			lines.push({
				indent: 1,
				gutter: "~",
				segments: [{ text: `↳ peer  ${entry.peer.value} → ${item.driftPeer}`, style: "changed" }],
			});
		} else if (!entry.peer && item.materializePeer) {
			materialize++;
			lines.push({
				indent: 0,
				gutter: "+",
				segments: [{ text: `${entry.catalog} › ${entry.pkg}  (materialize peer)`, style: "added" }],
			});
			lines.push({
				indent: 1,
				gutter: "+",
				segments: [{ text: `↳ peer (new)  → ${item.materializePeer}`, style: "added" }],
			});
		} else {
			upToDate++;
		}
	}
	lines.push({
		indent: 0,
		gutter: " ",
		segments: [
			{
				text: `${toUpdate} to update · ${major} major · ${resync} resync · ${materialize} new peer · ${upToDate} up to date`,
				style: "unchanged",
			},
		],
	});
	if (interop) {
		for (const a of interop.adjustments) {
			lines.push({ indent: 0, gutter: "~", segments: [{ text: `↓ ${a.pkg}  ${a.from} → ${a.to}`, style: "changed" }] });
			lines.push({ indent: 1, gutter: "~", segments: [{ text: `↳ peer  → ${a.peer}`, style: "changed" }] });
		}
		for (const c of interop.conflicts) {
			lines.push({
				indent: 0,
				gutter: "⚠",
				segments: [{ text: `${c.pkg} (kept ${c.ceiling}) blocked by ${c.blockedBy}`, style: "warn" }],
			});
		}
	}
	return lines;
}

/**
 * Render the summary to a string. Color defaults off so non-TTY/test callers
 * get clean text; the upgrade command passes the detected color flag.
 *
 * @internal
 */
export function renderSummary(
	decisions: readonly Decision[],
	interop?: InteropSummary,
	opts?: { color?: boolean },
): string {
	return toAnsi(summaryLines(decisions, interop), { color: opts?.color ?? false });
}
