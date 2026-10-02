import type { Block, Document, Inline } from "@effected/cli";
import { Doc } from "@effected/cli";
import { row, tone } from "./render/tone.js";
import type { RejectedEdit } from "./validate.js";
import { cellTone, displayCandidates, peerFor, tableLayout } from "./walk-reducer.js";
import type { Decision } from "./walk-types.js";

/** The interop section of an interactive summary: the unresolved conflicts. @internal */
export interface InteropSummary {
	readonly conflicts: readonly { readonly pkg: string; readonly ceiling: string; readonly blockedBy: string }[];
}

/**
 * Build the pending-decisions summary as a document: one table row per
 * decision — mirroring the interactive selection table, catalog headers,
 * chosen bubble filled — then a dim tally, interop conflicts, and any
 * rejected edits. Pure; the renderer the audience picks decides colour.
 *
 * @internal
 */
export function summaryDoc(
	decisions: readonly Decision[],
	interop?: InteropSummary,
	rejected?: readonly RejectedEdit[],
): Document {
	const lines: Array<ReadonlyArray<Inline>> = [];
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
			lines.push(row(" ", 0, [tone(`── catalog: ${entry.catalog} ──`, "unchanged")]));
		}
		const cells = displayCandidates(item);
		const content: Inline[] = [tone(entry.pkg.padEnd(pkgWidth + 2), "plain")];
		for (const c of cells) {
			const selected = c.kind === chosen.kind;
			content.push(tone(cellText(c, selected), cellTone(c, selected) ?? "unchanged"));
		}
		for (let ci = cells.length; ci < maxCells; ci++) {
			content.push(tone(blankCell, "plain"));
		}
		content.push(tone(`│ ${peerFor(item, chosen)}`, "unchanged"));
		lines.push(row(chosen.kind === "keep" ? " " : "~", 0, content));
		if (item.peerWarning) {
			lines.push(row("⚠", 1, [tone(item.peerWarning.message, "warn")]));
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
	lines.push(
		row(" ", 0, [
			tone(
				`${toUpdate} to update · ${major} major · ${resync} resync · ${materialize} new peer · ${upToDate} up to date`,
				"unchanged",
			),
		]),
	);
	if (interop) {
		for (const c of interop.conflicts) {
			lines.push(row("⚠", 0, [tone(`${c.pkg} (kept ${c.ceiling}) blocked by ${c.blockedBy}`, "warn")]));
		}
	}
	const blocks: Block[] = [Doc.lines(lines)];
	if (rejected && rejected.length > 0) {
		blocks.push(
			Doc.line(""),
			Doc.lines([
				row("⚠", 0, [tone("Rejected (no published version satisfies these):", "warn")]),
				...rejected.map((r) => row("⚠", 1, [tone(`${r.pkg} ${r.kind} ${r.value} — ${r.reason}`, "warn")])),
			]),
		);
	}
	return blocks;
}
