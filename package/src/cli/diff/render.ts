import type { BlockOf, Inline } from "@effected/cli";
import { Doc } from "@effected/cli";
import type { Gutter, Tag, Tone } from "../render/tone.js";
import { row, tone } from "../render/tone.js";
import type { ChangeKind, DiffNode } from "./types.js";

const CONTEXT = 2;
const GUTTER: Record<ChangeKind, Gutter> = {
	added: "+",
	removed: "-",
	changed: "~",
	unchanged: " ",
};
const TONE: Record<ChangeKind, Tone> = {
	added: "added",
	removed: "removed",
	changed: "changed",
	unchanged: "unchanged",
};

/** A scalar as YAML-shaped text: strings verbatim, everything else JSON. @internal */
export function scalarText(v: unknown): string {
	return typeof v === "string" ? v : JSON.stringify(v);
}

/** A flat row, its depth, and whether it is a "real" change (drives context collapsing). */
interface Flat {
	readonly row: ReadonlyArray<Inline>;
	readonly indent: number;
	readonly changed: boolean;
}

function flatten(node: DiffNode, depth: number, inheritedUnmanaged = false): Flat[] {
	const indent = depth;
	const gutter = GUTTER[node.kind];
	const tag: Tag | undefined = node.tag;
	const changed = node.kind !== "unchanged";

	// An unchanged line carrying the `unmanaged` tag (or nested under one) uses the
	// dedicated `unmanaged` tone so it reads distinctly from unchanged managed
	// lines. Non-unchanged kinds (e.g. `removed` in the Simulated view) keep their
	// own tone — there the gutter/color already carries the meaning.
	const unmanaged = inheritedUnmanaged || (node.tag === "unmanaged" && node.kind === "unchanged");
	const t: Tone = node.kind === "unchanged" && unmanaged ? "unmanaged" : TONE[node.kind];

	// Array element leaf: tagged by the diff builder (no key/value heuristic).
	const isArrayEl = node.arrayElement === true;

	if (node.children) {
		const self: Flat = { row: row(gutter, indent, [tone(`${node.key}:`, t)], tag), indent, changed };
		const kids = node.children.flatMap((c) => flatten(c, depth + 1, unmanaged));
		return [self, ...kids];
	}

	let text: string;
	if (node.kind === "changed") text = `${node.key}: ${scalarText(node.before)} → ${scalarText(node.after)}`;
	else if (isArrayEl) text = `- ${node.key}`;
	else text = `${node.key}: ${scalarText(node.after ?? node.before)}`;

	return [{ row: row(gutter, indent, [tone(text, t)], tag), indent, changed }];
}

/**
 * Render a diff tree to a `Lines` block in canonical-YAML shape. Default
 * collapses unchanged lines outside a 2-line window around changes into a
 * single "… N unchanged" marker; `full` keeps every line.
 *
 * @internal
 */
export function renderExportDiff(root: DiffNode, opts: { full: boolean }): BlockOf<"Lines"> {
	const flats = (root.children ?? []).flatMap((c) => flatten(c, 0));
	if (opts.full) return Doc.lines(flats.map((f) => f.row));

	// keep any line within CONTEXT of a changed line
	const keep = new Array<boolean>(flats.length).fill(false);
	flats.forEach((f, i) => {
		if (!f.changed) return;
		for (let j = Math.max(0, i - CONTEXT); j <= Math.min(flats.length - 1, i + CONTEXT); j++) keep[j] = true;
	});

	// Keep ancestor header lines of every kept line so nested values are never
	// orphaned under a collapsed parent.
	for (let i = 0; i < flats.length; i++) {
		if (!keep[i]) continue;
		let depth = flats[i].indent;
		for (let j = i - 1; j >= 0 && depth > 0; j--) {
			if (flats[j].indent < depth) {
				keep[j] = true;
				depth = flats[j].indent;
			}
		}
	}

	const out: Array<ReadonlyArray<Inline>> = [];
	let dropped = 0;
	const flushDropped = () => {
		if (dropped > 0) {
			out.push(row(" ", 0, [tone(`… ${dropped} unchanged`, "unchanged")]));
			dropped = 0;
		}
	};
	flats.forEach((f, i) => {
		if (keep[i]) {
			flushDropped();
			out.push(f.row);
		} else {
			dropped++;
		}
	});
	flushDropped();
	return Doc.lines(out);
}
