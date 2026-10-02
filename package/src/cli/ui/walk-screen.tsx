import { Fmt } from "@effected/cli";
import type { Screen } from "@effected/cli/ui";
import { KeyHelp, KeyTable, Styled, useKeys, useTerminalSize } from "@effected/cli/ui";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { GroupModel, GroupPeers } from "../interop-live.js";
import { computeGroupPeers } from "../interop-live.js";
import { TONES } from "../render/tone.js";
import type { TableKey, TableState } from "../walk-reducer.js";
import {
	cellTone,
	displayCandidates,
	initTable,
	peerFor,
	tableDecisions,
	tableLayout,
	tableStep,
	truncateEnd,
} from "../walk-reducer.js";
import type { Decision, WalkItem } from "../walk-types.js";

/** What the upgrade table is drawn from. @internal */
export interface WalkScreenProps {
	readonly items: readonly WalkItem[];
	/** Draw the dry-run banner: the walk behaves identically but nothing is written. */
	readonly dryRun: boolean;
	/** Packages the registry could not resolve — surfaced so a typo is never silently dropped. */
	readonly unresolved: readonly string[];
	/** Per-catalog interop models: enable live peer-floor + conflict recompute as picks change. */
	readonly interopModels: ReadonlyMap<string, GroupModel>;
}

/** The table's keys: arrows (or vim keys) to move and pick, Enter to finish. Esc and Ctrl-C are the host's. */
function walkKeys(dryRun: boolean): KeyTable<TableKey> {
	return KeyTable.make<TableKey>([
		{ keys: ["up", { char: "k" }], action: "up", help: "previous" },
		{ keys: ["down", { char: "j" }], action: "down", help: "next" },
		{ keys: ["left", { char: "h" }], action: "left", help: "older" },
		{ keys: ["right", { char: "l" }], action: "right", help: "newer" },
		{ keys: ["enter"], action: "submit", help: dryRun ? "preview" : "update" },
	]);
}

/**
 * Lines the table's chrome takes besides its rows: title, banners, spacer, key
 * help — plus one, because Ink treats a frame as tall as the terminal as
 * fullscreen and clears the screen and its scrollback on every redraw.
 */
function chromeHeight(props: WalkScreenProps): number {
	return 4 + (props.dryRun ? 1 : 0) + (props.unresolved.length > 0 ? 1 : 0);
}

/**
 * The interactive upgrade table. Every package is one row; each row is a radio
 * group over its candidates with keep (index 0) preselected, so the default
 * state of the table applies nothing. Enter resolves the screen with one
 * decision per row; Esc and Ctrl-C cancel it (the host's `Cancelled`).
 *
 * @internal
 */
export function makeWalkScreen(props: WalkScreenProps): Screen<Decision[]> {
	const { items, dryRun, unresolved, interopModels } = props;
	const keys = walkKeys(dryRun);
	return ({ resolve }) => {
		const Walk = (): ReactElement => {
			// The ref is the table's current state; `state` only drives the render.
			// Ink hands every key of one stdin read to the handler before React
			// re-renders, so stepping from the ref (not a render closure) keeps a
			// pasted or fast-typed burst correct — and resolving here, outside a state
			// updater, keeps the host's update out of React's render.
			const table = useRef<TableState>(initTable(items));
			const [state, setState] = useState<TableState>(table.current);
			const { columns, rows: termRows } = useTerminalSize();

			useKeys(keys, (key) => {
				const current = table.current;
				const next = tableStep(current, items, key);
				table.current = next;
				setState(next);
				if (next.done && !current.done) resolve(tableDecisions(next, items));
			});

			if (state.done) return <Text>Done.</Text>;

			const { pkgWidth, cellWidth, maxCells, blankCell, cellText } = tableLayout(items);
			// Columns consumed by everything left of a row's trailing annotation, so a long
			// peer-conflict message is truncated to the terminal width instead of wrapping
			// and shearing the column alignment. Each cell is `bubble+space+cell+2`.
			const fixedPrefix = 2 + (pkgWidth + 2) + maxCells * (cellWidth + 4) + 2;

			// Scroll the window to keep the cursor visible. Catalog headers share the
			// window, so reserve a line for each catalog; never fewer than three rows.
			const catalogs = new Set(items.map((i) => i.entry.catalog)).size;
			const height = Math.max(3, Math.min(items.length, termRows - chromeHeight(props) - catalogs));
			const start = Math.max(0, Math.min(state.cursor - Math.floor(height / 2), items.length - height));
			const visible = items.slice(start, start + height);

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
				const i = start + offset;
				if (item.entry.catalog !== lastCatalog) {
					lastCatalog = item.entry.catalog;
					rows.push(
						<Text key={`cat-${lastCatalog}`}>
							<Styled token="muted">{`  ── catalog: ${Fmt.sanitize(lastCatalog)} ──`}</Styled>
						</Text>,
					);
				}
				const onCursor = i === state.cursor;
				const pick = state.picks[i] ?? 0;
				const candidates = displayCandidates(item);
				const chosen = candidates[pick];
				// Interop rows show the live group-derived floor; everything else uses the
				// entry's own recomputed/keep peer.
				const gp = interopPeers.get(item.entry.catalog);
				const peerText = gp?.peer.get(item.entry.pkg) ?? (chosen === undefined ? "—" : peerFor(item, chosen));
				const conflict = gp?.conflict.get(item.entry.pkg);
				// Room left on the line for the trailing ⚠ annotation, after the peer cell.
				const room = Math.max(8, columns - fixedPrefix - peerText.length - 3);
				// One Text per row: its spans never shrink apart, so the columns stay
				// aligned, and a row wider than the terminal is cut at the end, not wrapped.
				rows.push(
					<Text key={`${item.entry.catalog}/${item.entry.pkg}`} wrap="truncate-end">
						{onCursor ? <Styled token="accent">❯ </Styled> : "  "}
						<Text bold={onCursor}>{Fmt.sanitize(item.entry.pkg).padEnd(pkgWidth + 2)}</Text>
						{candidates.map((c, ci) => {
							const t = cellTone(c, ci === pick);
							const text = cellText(c, ci === pick);
							return t === null ? (
								text
							) : (
								<Styled key={c.kind} token={TONES[t]}>
									{text}
								</Styled>
							);
						})}
						{blankCell.repeat(maxCells - candidates.length)}
						<Styled token="muted">{`│ ${peerText}`}</Styled>
						{conflict ? (
							<Styled token="failure">{truncateEnd(`  ⚠ needs ${Fmt.sanitize(conflict)}`, room)}</Styled>
						) : null}
						{item.peerWarning ? (
							<Styled token="failure">{truncateEnd(`  ⚠ ${Fmt.sanitize(item.peerWarning.message)}`, room)}</Styled>
						) : null}
					</Text>,
				);
			});

			return (
				<Box flexDirection="column">
					<Text bold wrap="truncate-end">
						{dryRun ? "Choose versions to preview" : "Choose versions to update"}
					</Text>
					{dryRun ? (
						<Text wrap="truncate-end">
							<Styled token="warning">DRY RUN — nothing will be written to the config</Styled>
						</Text>
					) : null}
					{
						// An unresolvable package has no row of its own — it plans to keep-only and is
						// filtered out as "up to date". Without this banner the author would never learn
						// that a name in their config does not exist in the registry.
						unresolved.length > 0 ? (
							<Text wrap="truncate-end">
								<Styled token="failure">
									{`⚠ Could not resolve from the registry — check for a typo: ${unresolved.map(Fmt.sanitize).join(", ")}`}
								</Styled>
							</Text>
						) : null
					}
					<Box height={1} />
					{rows}
					<KeyHelp tables={[keys]} />
				</Box>
			);
		};
		return <Walk />;
	};
}
