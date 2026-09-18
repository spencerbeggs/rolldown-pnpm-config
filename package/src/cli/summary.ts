import { toAnsi } from "./ui/ansi.js";
import type { ChangeStyle, Segment, StyledLine } from "./ui/styled.js";
import type { RejectedEdit } from "./validate.js";
import { displayCandidates, peerFor, tableLayout } from "./walk-reducer.js";
import type { Decision } from "./walk-types.js";

/** The interop section of an interactive summary: the unresolved conflicts. @internal */
export interface InteropSummary {
	readonly conflicts: readonly { readonly pkg: string; readonly ceiling: string; readonly blockedBy: string }[];
}

/**
 * Build the pending-decisions summary as styled lines: one table row per
 * decision — mirroring the interactive selection table, catalog headers,
 * chosen bubble filled — then a dim tally, interop conflicts, and any
 * rejected edits. Pure; color is applied by `renderSummary`/`toAnsi`.
 *
 * @internal
 */
export function summaryLines(
	decisions: readonly Decision[],
	interop?: InteropSummary,
	rejected?: readonly RejectedEdit[],
): StyledLine[] {
	const lines: StyledLine[] = [];
	let toUpdate = 0;
	let major = 0;
	let resync = 0;
	let materialize = 0;
	let upToDate = 0;

	// The same geometry as the interactive table, so the summary mirrors it.
	const { pkgWidth, maxCells, blankCell, cellText } = tableLayout(decisions.map((d) => d.item));

	let lastCatalog: string | null = null;
	for (const { item, chosen } of decisions) {
		const { entry } = item;
		if (entry.catalog !== lastCatalog) {
			lastCatalog = entry.catalog;
			lines.push({
				indent: 0,
				gutter: " ",
				segments: [{ text: `── catalog: ${entry.catalog} ──`, style: "unchanged" }],
			});
		}
		const cells = displayCandidates(item);
		const segments: Segment[] = [{ text: entry.pkg.padEnd(pkgWidth + 2), style: "plain" }];
		for (const c of cells) {
			const selected = c.kind === chosen.kind;
			const style: ChangeStyle = !selected
				? "unchanged"
				: c.kind === "keep"
					? "unchanged"
					: c.isMajor
						? "changed"
						: "added";
			segments.push({ text: cellText(c, selected), style });
		}
		for (let ci = cells.length; ci < maxCells; ci++) {
			segments.push({ text: blankCell, style: "plain" });
		}
		segments.push({ text: `│ ${peerFor(item, chosen)}`, style: "unchanged" });
		lines.push({ indent: 0, gutter: chosen.kind === "keep" ? " " : "~", segments });
		if (item.peerWarning) {
			lines.push({
				indent: 1,
				gutter: "⚠",
				segments: [{ text: item.peerWarning.message, style: "warn" }],
			});
		}
		if (chosen.kind !== "keep") {
			toUpdate++;
			if (chosen.isMajor) major++;
			if (!entry.peer && entry.strategy && chosen.peerRange) {
				materialize++;
			}
		} else if (entry.peer && item.driftPeer) {
			resync++;
		} else if (!entry.peer && item.materializePeer) {
			materialize++;
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
		for (const c of interop.conflicts) {
			lines.push({
				indent: 0,
				gutter: "⚠",
				segments: [{ text: `${c.pkg} (kept ${c.ceiling}) blocked by ${c.blockedBy}`, style: "warn" }],
			});
		}
	}
	if (rejected && rejected.length > 0) {
		lines.push({ indent: 0, gutter: " ", segments: [{ text: "", style: "plain" }] });
		lines.push({
			indent: 0,
			gutter: "⚠",
			segments: [{ text: "Rejected (no published version satisfies these):", style: "warn" }],
		});
		for (const r of rejected) {
			lines.push({
				indent: 1,
				gutter: "⚠",
				segments: [{ text: `${r.pkg} ${r.kind} ${r.value} — ${r.reason}`, style: "warn" }],
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
	rejected?: readonly RejectedEdit[],
): string {
	return toAnsi(summaryLines(decisions, interop, rejected), { color: opts?.color ?? false });
}
