import type { Edit } from "./types.js";

/**
 * Apply span replacements to a source string. Edits are applied in descending
 * start order so each edit's offsets remain valid as later text shifts. Throws
 * a RangeError if any two edits overlap.
 *
 * @internal
 */
export function applyEdits(source: string, edits: readonly Edit[]): string {
	const sorted = [...edits].sort((a, b) => b.span[0] - a.span[0]);
	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		const cur = sorted[i];
		if (cur.span[1] > prev.span[0]) {
			throw new RangeError(
				`Overlapping edits at [${cur.span[0]}, ${cur.span[1]}) and [${prev.span[0]}, ${prev.span[1]})`,
			);
		}
	}
	let out = source;
	for (const edit of sorted) {
		out = out.slice(0, edit.span[0]) + edit.text + out.slice(edit.span[1]);
	}
	return out;
}
