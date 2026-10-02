import type { Block, Document, Inline, Style, TokenName } from "@effected/cli";
import { Render } from "@effected/cli";

/** A document (or one block) rendered as an agent reads it: plain text, no escapes. */
export function plainText(doc: Document | Block): string {
	const document: Document = Array.isArray(doc) ? (doc as Document) : [doc as Block];
	return Render.plain(document, Render.contextOf({ audience: "agent" }));
}

/** {@link plainText}, one entry per line. */
export function plainLines(doc: Document | Block): string[] {
	return plainText(doc).split("\n");
}

/** The rows of a `Lines` block. */
export function rowsOf(block: Block): ReadonlyArray<ReadonlyArray<Inline>> {
	if (block._tag !== "Lines") throw new Error(`expected a Lines block, got ${block._tag}`);
	return block.lines;
}

/** The token of every toned text run in a row (the untoned gutter prefix excluded). */
export function tokensOf(row: ReadonlyArray<Inline>): Array<TokenName | Style> {
	return row.flatMap((i) => (i._tag === "Text" && i.token !== undefined ? [i.token] : []));
}
