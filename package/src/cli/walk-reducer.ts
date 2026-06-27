import type { Decision, WalkItem } from "./walk-types.js";

/** State of the interactive walk. */
export interface WalkState {
	readonly index: number;
	readonly cursor: number;
	readonly decisions: readonly Decision[];
	readonly done: boolean;
}

/** Index of the next actionable (not up-to-date) item at or after `from`, or -1. */
function nextActionable(items: readonly WalkItem[], from: number): number {
	for (let i = from; i < items.length; i++) {
		if (!items[i].upToDate) return i;
	}
	return -1;
}

/**
 * Initialize the walk on the first actionable item (auto-skipping up-to-date
 * items). If none are actionable, the walk is immediately done.
 *
 * @internal
 */
export function initWalk(items: readonly WalkItem[]): WalkState {
	const index = nextActionable(items, 0);
	return { index: index === -1 ? items.length : index, cursor: 0, decisions: [], done: index === -1 };
}

/**
 * Advance the walk by a key. up/down move the cursor within the current item's
 * candidates; enter records the highlighted candidate and moves to the next
 * actionable item (or completes).
 *
 * @internal
 */
export function walkStep(state: WalkState, items: readonly WalkItem[], key: "up" | "down" | "enter"): WalkState {
	if (state.done) return state;
	const item = items[state.index];
	const count = item.candidates.length;
	if (key === "up") return { ...state, cursor: (state.cursor - 1 + count) % count };
	if (key === "down") return { ...state, cursor: (state.cursor + 1) % count };
	// enter
	const chosen = item.candidates[state.cursor];
	const decisions = [...state.decisions, { item, chosen }];
	const next = nextActionable(items, state.index + 1);
	if (next === -1) return { ...state, decisions, done: true };
	return { index: next, cursor: 0, decisions, done: false };
}
