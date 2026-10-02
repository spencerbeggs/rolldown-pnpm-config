import type { Inline, Style, TokenName } from "@effected/cli";
import { Doc, Token } from "@effected/cli";

/**
 * The visual category of a run of text in a diff, summary or Simulated view.
 * Each tone maps to one theme token or style ({@link TONES}); the renderer the
 * audience picks decides whether it becomes colour.
 *
 * @internal
 */
export type Tone =
	| "added"
	| "removed"
	| "changed"
	| "unchanged"
	| "warn"
	| "local"
	| "unmanaged"
	| "plain"
	| "merge"
	| "overwrite";

/** The single-character gutter a diff-shaped row starts with. @internal */
export type Gutter = "+" | "~" | "-" | " " | "·" | "░" | "⚠";

/** An orthogonal annotation trailing a row, e.g. `  (local)`. @internal */
export type Tag = "local" | "unmanaged";

/**
 * The palette: one theme token (or explicit style) per tone. Semantic tones
 * use the theme's tokens so a theme override restyles them; `unmanaged` is a
 * fixed dark gray (distinct from the dim `unchanged`) and `local`/`overwrite`
 * are magenta. `plain` is unstyled.
 *
 * @internal
 */
export const TONES: Readonly<Record<Exclude<Tone, "plain">, TokenName | Style>> = {
	added: "success",
	removed: "failure",
	changed: "warning",
	unchanged: "muted",
	warn: "failure",
	local: Token.named("magenta"),
	unmanaged: Token.hex("#585858"),
	merge: "accent",
	overwrite: Token.named("magenta"),
};

/** A run of text in a tone. @internal */
export function tone(text: string, t: Tone): Inline {
	return t === "plain" ? Doc.text(text) : Doc.text(text, TONES[t]);
}

/**
 * One diff-shaped row: `<gutter><space><2-space indent><content><tag>`. The
 * gutter and the tag are plain characters, so a row keeps its meaning when the
 * renderer drops colour (an agent, a pipe, `NO_COLOR`).
 *
 * @internal
 */
export function row(gutter: Gutter, indent: number, content: ReadonlyArray<Inline>, tag?: Tag): ReadonlyArray<Inline> {
	return [
		Doc.text(`${gutter} ${"  ".repeat(indent)}`),
		...content,
		...(tag === undefined ? [] : [tone(`  (${tag})`, tag)]),
	];
}
