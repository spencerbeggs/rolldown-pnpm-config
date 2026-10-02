import type { Block } from "@effected/cli";
import { Doc } from "@effected/cli";
import type { Tone } from "./tone.js";
import { tone } from "./tone.js";

function swatches(entries: ReadonlyArray<readonly [label: string, t: Tone]>): Block {
	return Doc.line([
		Doc.text("  Legend:  "),
		...entries.map(([label, t], i) => tone(`■ ${label}${i < entries.length - 1 ? "  " : ""}`, t)),
	]);
}

/**
 * The colour legend for the config diff (the `preview` command and
 * `export --dry-run`). Each swatch carries the matching tone, so the legend
 * tracks the palette. Printed only when the output is coloured — without
 * colour the swatches are indistinguishable and the legend is noise.
 *
 * @internal
 */
export function legend(): Block {
	return swatches([
		["added", "added"],
		["removed", "removed"],
		["modified", "changed"],
		["unchanged", "unchanged"],
		["unmanaged", "unmanaged"],
	]);
}

/**
 * The legend for the Simulated view. That view is not a diff — nothing is
 * added or removed — so it has its own vocabulary: how each field is combined
 * (`merge`/`overwrite`) and how divergence is enforced (`warn`/`error`).
 *
 * @internal
 */
export function simulatedLegend(): Block {
	return swatches([
		["merge", "merge"],
		["overwrite", "overwrite"],
		["warn", "changed"],
		["error", "warn"],
	]);
}
