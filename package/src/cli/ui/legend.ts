import type { StyledLine } from "./styled.js";

/**
 * The color legend for the config diff (the `preview` command and
 * `export --dry-run`). A single styled line whose swatches each carry the
 * matching `ChangeStyle`, so the legend automatically tracks the palette.
 * Callers prepend it only when color is on — with color off the swatches are
 * indistinguishable and the legend is just noise.
 *
 * @internal
 */
export function legendLines(): StyledLine[] {
	return [
		{
			indent: 0,
			gutter: " ",
			segments: [
				{ text: "Legend:  ", style: "plain" },
				{ text: "■ added  ", style: "added" },
				{ text: "■ removed  ", style: "removed" },
				{ text: "■ modified  ", style: "changed" },
				{ text: "■ unchanged  ", style: "unchanged" },
				{ text: "■ unmanaged", style: "unmanaged" },
			],
		},
	];
}

/**
 * The legend for the Simulated view. That view is not a diff — nothing is added
 * or removed — so it gets its own vocabulary: how each field is combined
 * (`merge`/`overwrite`) and how divergence is enforced (`warn`/`error`).
 *
 * @internal
 */
export function simulatedLegendLines(): StyledLine[] {
	return [
		{
			indent: 0,
			gutter: " ",
			segments: [
				{ text: "Legend:  ", style: "plain" },
				{ text: "■ merge  ", style: "merge" },
				{ text: "■ overwrite  ", style: "overwrite" },
				{ text: "■ warn  ", style: "changed" },
				{ text: "■ error", style: "warn" },
			],
		},
	];
}
