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

const ORDER: Record<Candidate["kind"], number> = { keep: 0, "in-range": 1, latest: 2 };

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
 * Initialize the table: cursor on the first row, keep selected on every row, so
 * the default state applies nothing.
 *
 * @internal
 */
export function initTable(items: readonly WalkItem[]): TableState {
	return { cursor: 0, picks: items.map(() => 0), done: false, cancelled: false };
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
