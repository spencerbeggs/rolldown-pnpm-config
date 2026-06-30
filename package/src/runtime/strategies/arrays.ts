import type { Strategy } from "../types.js";

function unionSort(managed: readonly string[], local: readonly string[] | undefined): string[] {
	const set = new Set(managed);
	for (const item of local ?? []) set.add(item);
	return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Union + sort string arrays; child entries are added to the managed set. Quiet.
 *
 * @internal
 */
export const arrayUnion: Strategy = (base, local) => ({
	merged: unionSort((base ?? []) as string[], local as string[] | undefined),
	divergences: [],
});

/**
 * Per-axis union of a record of string arrays; drops empty axes. Quiet.
 *
 * @internal
 */
export const arrayRecordUnion: Strategy = (base, local) => {
	const managed = (base ?? {}) as Record<string, readonly string[] | undefined>;
	const child = (local ?? {}) as Record<string, readonly string[] | undefined>;
	const keys = new Set([...Object.keys(managed), ...Object.keys(child)]);
	const result: Record<string, string[]> = {};
	for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
		const merged = unionSort(managed[key] ?? [], child[key]);
		if (merged.length > 0) result[key] = merged;
	}
	return { merged: result, divergences: [] };
};
