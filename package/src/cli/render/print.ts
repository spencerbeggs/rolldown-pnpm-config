import type { Block, BlockOf, CliLinks } from "@effected/cli";
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
 * Print a diff-shaped view to stdout: an optional heading line, the legend
 * when the output is coloured, then the view's rows, each kept whole on one
 * line whatever the width (the heading may wrap at a person's terminal). The
 * audience picks the renderer (ANSI for a person, plain for an agent, the
 * GitHub log under Actions).
 *
 * @internal
 */
export function printView(
	view: BlockOf<"Lines">,
	options: { readonly legend?: Block; readonly heading?: string } = {},
): Effect.Effect<void, never, CliTheme | Audience | TerminalEnv | CliLinks> {
	return Effect.gen(function* () {
		const doc: Block[] = [];
		if (options.heading !== undefined) doc.push(Doc.line(options.heading), Doc.line(""));
		if (options.legend !== undefined && (yield* coloured)) doc.push(options.legend, Doc.line(""));
		// Rows stay whole at any width; the heading above is prose and may wrap.
		doc.push(Doc.lines(view.lines, { wrap: false }));
		yield* Doc.print(doc);
	});
}
