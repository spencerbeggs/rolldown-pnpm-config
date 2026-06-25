import type { Strategy } from "../types.js";

function unionSort(silk: readonly string[], local: readonly string[] | undefined): string[] {
	const set = new Set(silk);
	for (const item of local ?? []) set.add(item);
	return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Union + sort string arrays; child entries added to the silk set. Quiet. Ports
 * Silk `mergeStringArrays`.
 *
 * @internal
 */
export const arrayUnion: Strategy = (base, local) => ({
	merged: unionSort((base ?? []) as string[], local as string[] | undefined),
	divergences: [],
});

/**
 * Per-axis union of a record of string arrays; drops empty axes. Quiet. Ports
 * Silk `mergeArrayRecord`.
 *
 * @internal
 */
export const arrayRecordUnion: Strategy = (base, local) => {
	const silk = (base ?? {}) as Record<string, readonly string[] | undefined>;
	const child = (local ?? {}) as Record<string, readonly string[] | undefined>;
	const keys = new Set([...Object.keys(silk), ...Object.keys(child)]);
	const result: Record<string, string[]> = {};
	for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
		const merged = unionSort(silk[key] ?? [], child[key]);
		if (merged.length > 0) result[key] = merged;
	}
	return { merged: result, divergences: [] };
};
