/** Visual category for a segment or whole line. @internal */
export type ChangeStyle = "added" | "removed" | "changed" | "unchanged" | "warn" | "local" | "unmanaged" | "plain";

/** Orthogonal annotation attached to a line. @internal */
export type DiffTag = "local" | "unmanaged";

/** A run of text with one style. @internal */
export interface Segment {
	readonly text: string;
	readonly style: ChangeStyle;
}

/** One rendered line: a gutter char, an indent depth, styled text, optional tag. @internal */
export interface StyledLine {
	readonly indent: number;
	readonly gutter: "+" | "~" | "-" | " " | "·" | "░" | "⚠";
	readonly segments: readonly Segment[];
	readonly tag?: DiffTag;
}

/** SGR open/close codes per style (close is always 0=reset for simplicity). @internal */
export const ANSI_OPEN: Record<ChangeStyle, string> = {
	added: "\x1b[32m", // green
	removed: "\x1b[31m", // red
	changed: "\x1b[33m", // yellow
	warn: "\x1b[31m", // red
	local: "\x1b[35m", // magenta
	unmanaged: "\x1b[2m", // dim
	unchanged: "\x1b[2m", // dim
	plain: "",
};
const ANSI_RESET = "\x1b[0m";

/** Apply (or omit) the SGR code for a style. @internal */
export function paint(text: string, style: ChangeStyle, color: boolean): string {
	if (!color || style === "plain" || ANSI_OPEN[style] === "") return text;
	return `${ANSI_OPEN[style]}${text}${ANSI_RESET}`;
}

/** The trailing annotation for a tag, e.g. "  (local)". @internal */
export function tagSuffix(tag: DiffTag | undefined): string {
	if (tag === "local") return "  (local)";
	if (tag === "unmanaged") return "  (unmanaged)";
	return "";
}
