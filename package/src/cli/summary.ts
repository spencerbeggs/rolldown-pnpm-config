import { toAnsi } from "./ui/ansi.js";
import type { ChangeStyle, Segment, StyledLine } from "./ui/styled.js";
import type { RejectedEdit } from "./validate.js";
import { displayCandidates, peerFor } from "./walk-reducer.js";
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

/** Trailing annotation appended to a major candidate's cell, e.g. " ⚠ major". */
const MAJOR_SUFFIX = " ⚠ major";
/** Filled / hollow radio glyphs. MUST match `ui/Walk.ts` — the summary mirrors the table. */
const SELECTED = "●";
const UNSELECTED = "○";
/** "● " / "○ " glyph-plus-space prefix width, common to every cell. */
const BUBBLE_WIDTH = 2;

/**
 * Build the pending-decisions summary as styled lines: one table row per
 * decision — mirroring the interactive selection table, catalog headers,
 * chosen bubble filled — then a dim tally, interop adjustments, conflicts,
 * and any rejected edits. Pure; color is applied by `renderSummary`/`toAnsi`.
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

	const pkgWidth = decisions.length ? Math.max(...decisions.map((d) => d.item.entry.pkg.length)) : 0;
	// Widest single candidate cell (range text, plus the major suffix when present)
	// across all rows, so every cell reserves the same width whether or not that
	// particular candidate happens to be major.
	const cellWidth = decisions.length
		? Math.max(
				...decisions.flatMap((d) =>
					displayCandidates(d.item).map((c) => c.range.length + (c.isMajor ? MAJOR_SUFFIX.length : 0)),
				),
			)
		: 0;
	// Every row emits the same number of cells (real or blank placeholders) so the
	// peer separator lands in the same column regardless of how many candidates a
	// given row has.
	const maxCells = decisions.length ? Math.max(...decisions.map((d) => displayCandidates(d.item).length)) : 0;
	const blankCell = `${" ".repeat(BUBBLE_WIDTH + cellWidth)}  `;

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
			const bubble = selected ? SELECTED : UNSELECTED;
			const style: ChangeStyle = !selected
				? "unchanged"
				: c.kind === "keep"
					? "unchanged"
					: c.isMajor
						? "changed"
						: "added";
			// Pad the range+major content together so the major suffix never shifts a
			// later column: every cell reserves cellWidth regardless of whether this
			// particular candidate is major.
			const content = `${c.range}${c.isMajor ? MAJOR_SUFFIX : ""}`.padEnd(cellWidth);
			segments.push({ text: `${bubble} ${content}  `, style });
		}
		// Pad rows with fewer candidates than the widest row out to maxCells so every
		// row emits the same total cell count and the peer separator lands in the
		// same column.
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
