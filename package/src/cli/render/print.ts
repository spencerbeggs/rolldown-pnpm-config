import type { Block, CliLinks, DocPrintOptions, Document } from "@effected/cli";
import { CliTheme, Doc } from "@effected/cli";
import type { TerminalEnv } from "@effected/env";
import { Audience } from "@effected/env";
import { Effect } from "effect";

/**
 * Whether stdout is painted for a person: a human audience at a colour level
 * above `none`. A legend is only worth printing then — without colour its
 * swatches are indistinguishable.
 *
 * @internal
 */
export const coloured: Effect.Effect<boolean, never, CliTheme | Audience> = Effect.gen(function* () {
	const theme = yield* CliTheme;
	const audience = yield* Audience;
	return audience.kind === "human" && theme.color !== "none";
});

/**
 * Print a document with no width limit, for every audience. Diffs, summaries
 * and package lists are line-oriented data: a hard wrap at a person's width (80
 * when output is piped) would split a row away from its gutter and break a
 * grep. A terminal still soft-wraps a long line when it shows it.
 *
 * @internal
 */
export function printDoc(
	doc: Document,
	options: Omit<DocPrintOptions, "width"> = {},
): Effect.Effect<void, never, CliTheme | Audience | TerminalEnv | CliLinks> {
	return Doc.print(doc, { ...options, width: Number.POSITIVE_INFINITY });
}

/**
 * Print a diff-shaped view to stdout: an optional heading line, the legend
 * when the output is coloured, then the view. The audience picks the
 * renderer (ANSI for a person, plain for an agent, the GitHub log under
 * Actions).
 *
 * @internal
 */
export function printView(
	view: Block,
	options: { readonly legend?: Block; readonly heading?: string } = {},
): Effect.Effect<void, never, CliTheme | Audience | TerminalEnv | CliLinks> {
	return Effect.gen(function* () {
		const doc: Block[] = [];
		if (options.heading !== undefined) doc.push(Doc.line(options.heading), Doc.line(""));
		if (options.legend !== undefined && (yield* coloured)) doc.push(options.legend, Doc.line(""));
		doc.push(view);
		yield* printDoc(doc);
	});
}
