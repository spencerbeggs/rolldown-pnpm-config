import type { Block, Document } from "@effected/cli";
import { Doc, Status } from "@effected/cli";

function statusDoc(status: "failure" | "warning", message: string): Document {
	const [first = "", ...rest] = message.split("\n");
	const blocks: Block[] = [Doc.line([Doc.status(Status.core, status), " ", first])];
	// Verbatim: the detail lines (a package list, an indented message) never wrap.
	if (rest.length > 0) blocks.push(Doc.verbatim(rest.join("\n")));
	return blocks;
}

/**
 * The failure report for one of the CLI's own errors: a status line carrying
 * the message's first line, then any further lines as they were written (a
 * list of packages, say). Used by each error's `CliDoc` method, so
 * `CliRuntime.main` draws the message without the error class's name.
 *
 * @internal
 */
export function failureDoc(message: string): Document {
	return statusDoc("failure", message);
}

/**
 * A multi-line warning drawn like a failure report but with the warning mark:
 * the first line beside the glyph, the rest as written. For a warning longer
 * than the one line `CliMessage.warning` takes (a list of packages, say);
 * printed to stderr.
 *
 * @internal
 */
export function warningDoc(message: string): Document {
	return statusDoc("warning", message);
}
