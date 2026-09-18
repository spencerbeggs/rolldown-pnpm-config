import type { Candidate } from "./types.js";
import type { Decision, WalkItem } from "./walk-types.js";

/** State of the interactive table: one radio-group selection per row. */
export interface TableState {
	/** Index of the row under the cursor. */
	readonly cursor: number;
	/** Selected index into `displayCandidates(items[i])`, per row. 0 is always keep. */
	readonly picks: readonly number[];
	readonly done: boolean;
	readonly cancelled: boolean;
}

/** A key the table responds to. */
export type TableKey = "up" | "down" | "left" | "right" | "submit" | "cancel";

const ORDER: Record<Candidate["kind"], number> = { keep: 0, "in-range": 1, minor: 2, latest: 3 };

/** Trailing annotation appended to a major candidate's cell, e.g. " ⚠ major". @internal */
export const MAJOR_SUFFIX = " ⚠ major";
/** Filled / hollow radio glyphs, matching `pnpm up -i`. @internal */
export const SELECTED = "●";
/** @internal */
export const UNSELECTED = "○";
/** "● " / "○ " glyph-plus-space prefix width, common to every cell. */
const BUBBLE_WIDTH = 2;

/** The column geometry shared by the interactive table and its summary mirror. @internal */
export interface TableLayout {
	/** Widest package name; the name column is padded to this plus two. */
	readonly pkgWidth: number;
	/** Widest candidate cell (range text plus the major suffix when present). */
	readonly cellWidth: number;
	/** Cells per row — every row emits this many, blank-padded. */
	readonly maxCells: number;
	/** A blank placeholder cell of the same width as a real one. */
	readonly blankCell: string;
	/** A candidate's cell text: bubble, padded range (+ major suffix), two-space gutter. */
	readonly cellText: (c: Candidate, selected: boolean) => string;
}

/**
 * Compute the table geometry once for a set of rows. The range and the major
 * suffix are padded TOGETHER so a major annotation never shifts a later
 * column, and every row emits `maxCells` cells so the peer separator lands
 * in the same column regardless of how many candidates a row has.
 *
 * @internal
 */
export function tableLayout(items: readonly WalkItem[]): TableLayout {
	const cells = items.map(displayCandidates);
	const pkgWidth = items.length ? Math.max(...items.map((i) => i.entry.pkg.length)) : 0;
	const cellWidth = items.length
		? Math.max(...cells.flatMap((cs) => cs.map((c) => c.range.length + (c.isMajor ? MAJOR_SUFFIX.length : 0))))
		: 0;
	const maxCells = items.length ? Math.max(...cells.map((cs) => cs.length)) : 0;
	return {
		pkgWidth,
		cellWidth,
		maxCells,
		blankCell: `${" ".repeat(BUBBLE_WIDTH + cellWidth)}  `,
		cellText: (c, selected) =>
			`${selected ? SELECTED : UNSELECTED} ${`${c.range}${c.isMajor ? MAJOR_SUFFIX : ""}`.padEnd(cellWidth)}  `,
	};
}

/**
 * Truncate `s` to at most `max` display columns, appending `…` when clipped.
 * Keeps a long peer-conflict annotation from wrapping and breaking the table's
 * column alignment. A `max` of 1 or less yields just the ellipsis.
 *
 * @internal
 */
export function truncateEnd(s: string, max: number): string {
	if (s.length <= max) return s;
	if (max <= 1) return "…";
	return `${s.slice(0, max - 1)}…`;
}

/**
 * The row's options in display order: keep first (always index 0, always the
 * default), then the in-range bump, then the latest-overall bump. `planEntry`
 * emits them in the opposite order, with keep last.
 *
 * @internal
 */
export function displayCandidates(item: WalkItem): readonly Candidate[] {
	return [...item.candidates].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

/**
 * Initialize the table: keep selected on every row (so the default state applies
 * nothing), and the cursor on the first actionable row. Since every discovered
 * row is shown — up-to-date rows included, as context — the cursor skips past any
 * leading inert keep-only rows to land where the user can act; it falls back to
 * row 0 when nothing is actionable.
 *
 * @internal
 */
export function initTable(items: readonly WalkItem[]): TableState {
	const first = items.findIndex((i) => !i.upToDate);
	return { cursor: first === -1 ? 0 : first, picks: items.map(() => 0), done: false, cancelled: false };
}

const clamp = (n: number, max: number) => (n < 0 ? 0 : n > max ? max : n);

/**
 * Advance the table by a key. up/down move between rows; left/right move the
 * radio selection within the row under the cursor; submit applies; cancel exits
 * without applying. Both axes clamp at their ends rather than wrapping.
 *
 * @internal
 */
export function tableStep(state: TableState, items: readonly WalkItem[], key: TableKey): TableState {
	if (state.done) return state;
	if (key === "submit") return { ...state, done: true };
	if (key === "cancel") return { ...state, done: true, cancelled: true };
	if (items.length === 0) return state;
	if (key === "up") return { ...state, cursor: clamp(state.cursor - 1, items.length - 1) };
	if (key === "down") return { ...state, cursor: clamp(state.cursor + 1, items.length - 1) };
	// left / right
	const count = displayCandidates(items[state.cursor]).length;
	const delta = key === "right" ? 1 : -1;
	const picks = [...state.picks];
	picks[state.cursor] = clamp(picks[state.cursor] + delta, count - 1);
	return { ...state, picks };
}

/**
 * Project the table's selections into decisions. A cancelled table yields none,
 * so nothing is written.
 *
 * @internal
 */
export function tableDecisions(state: TableState, items: readonly WalkItem[]): Decision[] {
	if (state.cancelled) return [];
	return items.map((item, i) => ({ item, chosen: displayCandidates(item)[state.picks[i] ?? 0] }));
}

/**
 * The peer range that would be written for a row's currently chosen candidate.
 * Non-keep candidates carry their own recomputed `peerRange`; keep reuses
 * whichever peer source the item already resolved (a drift resync, a
 * materialize target, or the entry's existing literal), falling back to an
 * em dash placeholder when none applies.
 *
 * @internal
 */
export function peerFor(item: WalkItem, chosen: Candidate): string {
	if (chosen.kind !== "keep") return chosen.peerRange ?? "—";
	if (item.driftPeer) return item.driftPeer;
	if (item.materializePeer) return item.materializePeer;
	return item.entry.peer?.value ?? "—";
}

/**
 * The Ink color for one candidate cell, or null for the terminal's default.
 *
 * Only a SELECTED UPGRADE is colored — green in-range, yellow for a major. A
 * selected KEEP is deliberately left uncolored: it is the current value, not a
 * change, and coloring it dim made the column the eye lands on first read as
 * disabled. Unselected cells are always default.
 *
 * Extracted from the render so it can be unit-tested: `ink-testing-library`
 * strips ANSI from `lastFrame()`, so a color assertion is impossible against
 * the rendered output.
 *
 * @internal
 */
export function cellColor(candidate: Candidate, selected: boolean): "green" | "yellow" | null {
	if (!selected || candidate.kind === "keep") return null;
	return candidate.isMajor ? "yellow" : "green";
}
