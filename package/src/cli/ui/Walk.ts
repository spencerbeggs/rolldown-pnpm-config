import { Box, Text, useApp, useInput } from "ink";
import type { ReactElement } from "react";
import { createElement, useEffect, useState } from "react";
import type { TableState } from "../walk-reducer.js";
import { cellColor, displayCandidates, initTable, peerFor, tableDecisions, tableStep } from "../walk-reducer.js";
import type { Decision, WalkItem } from "../walk-types.js";

interface WalkProps {
	readonly items: readonly WalkItem[];
	readonly onDone: (decisions: readonly Decision[]) => void;
	/** Render the dry-run banner: the walk behaves identically but nothing is written. */
	readonly dryRun?: boolean;
	/** Packages the registry could not resolve — surfaced so a typo is never silently dropped. */
	readonly unresolved?: readonly string[];
}

/** Rows visible at once before the viewport scrolls. */
const VIEWPORT = 20;

/**
 * Interactive upgrade table rendered with Ink. Every package is one row; each
 * row is a radio group over its candidates with keep (index 0) preselected, so
 * the default state of the table applies nothing.
 *
 * Written with React.createElement (no JSX) so the file can be plain .ts
 * without requiring TSX transform configuration.
 *
 * @internal
 */
export function Walk({ items, onDone, dryRun = false, unresolved = [] }: WalkProps): ReactElement {
	const app = useApp();
	const [state, setState] = useState<TableState>(() => initTable(items));

	useEffect(() => {
		if (items.length === 0) {
			onDone([]);
			app.exit();
		}
	}, []);

	useInput((_input, key) => {
		if (state.done) return;
		const which = key.upArrow
			? "up"
			: key.downArrow
				? "down"
				: key.leftArrow
					? "left"
					: key.rightArrow
						? "right"
						: key.return
							? "submit"
							: key.escape
								? "cancel"
								: null;
		if (!which) return;
		const next = tableStep(state, items, which);
		setState(next);
		if (next.done) {
			onDone(tableDecisions(next, items));
			app.exit();
		}
	});

	if (state.done || items.length === 0) {
		return createElement(Text, null, "Done.");
	}

	const pkgWidth = Math.max(...items.map((i) => i.entry.pkg.length));
	const MAJOR_SUFFIX = " ⚠ major";
	// Filled / hollow radio glyphs, matching `pnpm up -i`.
	const SELECTED = "●";
	const UNSELECTED = "○";
	// Widest single candidate cell (range text, plus the major suffix when present)
	// across all rows, so every cell reserves the same width whether or not that
	// particular candidate happens to be major.
	const cellWidth = Math.max(
		...items.flatMap((i) => displayCandidates(i).map((c) => c.range.length + (c.isMajor ? MAJOR_SUFFIX.length : 0))),
	);
	// Every row emits the same number of cells (real or blank placeholders) so the
	// peer separator lands in the same column regardless of how many candidates a
	// given row has.
	const maxCells = Math.max(...items.map((i) => displayCandidates(i).length));
	// "● " / "○ " glyph-plus-space prefix width, common to every cell.
	const BUBBLE_WIDTH = 2;
	const blankCell = `${" ".repeat(BUBBLE_WIDTH + cellWidth)}  `;

	// Scroll the viewport to keep the cursor visible.
	const start = Math.max(0, Math.min(state.cursor - Math.floor(VIEWPORT / 2), items.length - VIEWPORT));
	const visible = items.slice(Math.max(0, start), Math.max(0, start) + VIEWPORT);

	const rows: ReactElement[] = [];
	let lastCatalog: string | null = null;

	visible.forEach((item, offset) => {
		const i = Math.max(0, start) + offset;
		if (item.entry.catalog !== lastCatalog) {
			lastCatalog = item.entry.catalog;
			rows.push(
				createElement(Text, { key: `cat-${item.entry.catalog}`, dimColor: true }, `  ── catalog: ${lastCatalog} ──`),
			);
		}
		const onCursor = i === state.cursor;
		const pick = state.picks[i] ?? 0;
		const candidates = displayCandidates(item);
		const cells = candidates.map((c, ci) => {
			const selected = ci === pick;
			const bubble = selected ? SELECTED : UNSELECTED;
			const major = c.isMajor ? MAJOR_SUFFIX : "";
			// Pad the range+major content together so the major suffix never shifts
			// a later column: every cell reserves cellWidth regardless of whether
			// this particular candidate is major.
			const content = `${c.range}${major}`.padEnd(cellWidth);
			const color = cellColor(c, selected);
			return createElement(Text, { key: c.kind, ...(color ? { color } : {}) }, `${bubble} ${content}  `);
		});
		// Pad rows with fewer candidates than the widest row out to maxCells so
		// every row emits the same total cell count and the peer separator lands
		// in the same column.
		for (let ci = candidates.length; ci < maxCells; ci++) {
			cells.push(createElement(Text, { key: `blank-${ci}` }, blankCell));
		}
		const chosen = candidates[pick];
		rows.push(
			createElement(
				Box,
				{ key: `${item.entry.catalog}/${item.entry.pkg}` },
				createElement(Text, { ...(onCursor ? { color: "cyan" } : {}) }, onCursor ? "❯ " : "  "),
				createElement(Text, { bold: onCursor }, item.entry.pkg.padEnd(pkgWidth + 2)),
				...cells,
				createElement(Text, { dimColor: true }, `│ ${chosen === undefined ? "—" : peerFor(item, chosen)}`),
				item.peerWarning ? createElement(Text, { color: "red" }, `  ⚠ ${item.peerWarning.message}`) : null,
			),
		);
	});

	return createElement(
		Box,
		{ flexDirection: "column" },
		createElement(
			Text,
			{ bold: true },
			dryRun ? "Enter to preview • Esc to cancel" : "Enter to update • Esc to cancel",
		),
		dryRun ? createElement(Text, { color: "yellow" }, "DRY RUN — nothing will be written to the config") : null,
		// An unresolvable package has no row of its own — it plans to keep-only and is
		// filtered out as "up to date". Without this banner the author would never learn
		// that a name in their config does not exist in the registry.
		unresolved.length > 0
			? createElement(
					Text,
					{ color: "red" },
					`⚠ Could not resolve from the registry — check for a typo: ${unresolved.join(", ")}`,
				)
			: null,
		createElement(Box, { height: 1 }),
		...rows,
	);
}
