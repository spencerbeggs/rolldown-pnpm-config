import { Box, Text, useApp, useInput } from "ink";
import type { ReactElement } from "react";
import { createElement, useEffect, useState } from "react";
import type { GroupModel, GroupPeers } from "../interop-live.js";
import { computeGroupPeers } from "../interop-live.js";
import type { TableState } from "../walk-reducer.js";
import {
	cellColor,
	displayCandidates,
	initTable,
	peerFor,
	tableDecisions,
	tableLayout,
	tableStep,
	truncateEnd,
} from "../walk-reducer.js";
import type { Decision, WalkItem } from "../walk-types.js";

interface WalkProps {
	readonly items: readonly WalkItem[];
	readonly onDone: (decisions: readonly Decision[]) => void;
	/** Render the dry-run banner: the walk behaves identically but nothing is written. */
	readonly dryRun?: boolean;
	/** Packages the registry could not resolve — surfaced so a typo is never silently dropped. */
	readonly unresolved?: readonly string[];
	/** Per-catalog interop models: enable live peer-floor + conflict recompute as picks change. */
	readonly interopModels?: ReadonlyMap<string, GroupModel>;
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
export function Walk({
	items,
	onDone,
	dryRun = false,
	unresolved = [],
	interopModels = new Map(),
}: WalkProps): ReactElement {
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

	const { pkgWidth, cellWidth, maxCells, blankCell, cellText } = tableLayout(items);

	// Columns consumed by everything left of a row's trailing annotation, so a long
	// peer-conflict message can be truncated to the terminal width instead of
	// wrapping and shearing the column alignment. Each cell is `bubble+space+cell+2`.
	const termCols = process.stdout.columns ?? 100;
	const fixedPrefix = 2 + (pkgWidth + 2) + maxCells * (cellWidth + 4) + 2;

	// Scroll the viewport to keep the cursor visible.
	const start = Math.max(0, Math.min(state.cursor - Math.floor(VIEWPORT / 2), items.length - VIEWPORT));
	const visible = items.slice(Math.max(0, start), Math.max(0, start) + VIEWPORT);

	// Live interop peer floors + conflicts, recomputed from the CURRENT picks so
	// changing any member's version instantly updates every dependent's peer and
	// surfaces combos that no longer satisfy an in-group peer.
	const interopPeers = new Map<string, GroupPeers>();
	for (const [catalog, model] of interopModels) {
		const selected = new Map<string, string>();
		items.forEach((it, idx) => {
			if (it.entry.catalog !== catalog) return;
			const cand = displayCandidates(it)[state.picks[idx] ?? 0];
			if (cand) selected.set(it.entry.pkg, cand.version);
		});
		interopPeers.set(catalog, computeGroupPeers(model, selected));
	}

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
			const color = cellColor(c, selected);
			return createElement(Text, { key: c.kind, ...(color ? { color } : {}) }, cellText(c, selected));
		});
		for (let ci = candidates.length; ci < maxCells; ci++) {
			cells.push(createElement(Text, { key: `blank-${ci}` }, blankCell));
		}
		const chosen = candidates[pick];
		// Interop rows show the live group-derived floor; everything else uses the
		// entry's own recomputed/keep peer.
		const gp = interopPeers.get(item.entry.catalog);
		const peerText = gp?.peer.get(item.entry.pkg) ?? (chosen === undefined ? "—" : peerFor(item, chosen));
		const conflict = gp?.conflict.get(item.entry.pkg);
		// Room left on the line for the trailing ⚠ annotation, after the peer cell.
		const room = Math.max(8, termCols - fixedPrefix - peerText.length - 3);
		rows.push(
			createElement(
				Box,
				{ key: `${item.entry.catalog}/${item.entry.pkg}` },
				createElement(Text, { ...(onCursor ? { color: "cyan" } : {}) }, onCursor ? "❯ " : "  "),
				createElement(Text, { bold: onCursor }, item.entry.pkg.padEnd(pkgWidth + 2)),
				...cells,
				createElement(Text, { dimColor: true }, `│ ${peerText}`),
				conflict ? createElement(Text, { color: "red" }, truncateEnd(`  ⚠ needs ${conflict}`, room)) : null,
				item.peerWarning
					? createElement(Text, { color: "red" }, truncateEnd(`  ⚠ ${item.peerWarning.message}`, room))
					: null,
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
