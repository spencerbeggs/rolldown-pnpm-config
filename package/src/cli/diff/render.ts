import type { ChangeStyle, DiffTag, Segment, StyledLine } from "../ui/styled.js";
import type { ChangeKind, DiffNode } from "./types.js";

const CONTEXT = 2;
const GUTTER: Record<ChangeKind, StyledLine["gutter"]> = {
	added: "+",
	removed: "-",
	changed: "~",
	unchanged: " ",
};
const STYLE: Record<ChangeKind, ChangeStyle> = {
	added: "added",
	removed: "removed",
	changed: "changed",
	unchanged: "unchanged",
};

function scalarText(v: unknown): string {
	return typeof v === "string" ? v : JSON.stringify(v);
}

/** A flat line plus whether it is a "real" change (drives context collapsing). */
interface Flat {
	readonly line: StyledLine;
	readonly changed: boolean;
}

function flatten(node: DiffNode, depth: number): Flat[] {
	const indent = depth;
	const gutter = GUTTER[node.kind];
	const style = STYLE[node.kind];
	const tag: DiffTag | undefined = node.tag;
	const changed = node.kind !== "unchanged";

	// Array element leaf: childless, and its key is the stringified element value.
	const isArrayEl = !node.children && node.key === scalarText(node.after ?? node.before);

	if (node.children) {
		const header: Segment[] = [{ text: `${node.key}:`, style }];
		const self: Flat = { line: { indent, gutter, segments: header, ...(tag ? { tag } : {}) }, changed };
		const kids = node.children.flatMap((c) => flatten(c, depth + 1));
		return [self, ...kids];
	}

	let text: string;
	if (node.kind === "changed") text = `${node.key}: ${scalarText(node.before)} → ${scalarText(node.after)}`;
	else if (isArrayEl) text = `- ${node.key}`;
	else text = `${node.key}: ${scalarText(node.after ?? node.before)}`;

	return [{ line: { indent, gutter, segments: [{ text, style }], ...(tag ? { tag } : {}) }, changed }];
}

/**
 * Render a diff tree to styled lines in canonical-YAML shape. Default collapses
 * unchanged lines outside a 2-line window around changes into a single
 * "… N unchanged" marker; `full` keeps every line.
 *
 * @internal
 */
export function renderExportDiff(root: DiffNode, opts: { full: boolean }): StyledLine[] {
	const flats = (root.children ?? []).flatMap((c) => flatten(c, 0));
	if (opts.full) return flats.map((f) => f.line);

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
		let depth = flats[i].line.indent;
		for (let j = i - 1; j >= 0 && depth > 0; j--) {
			if (flats[j].line.indent < depth) {
				keep[j] = true;
				depth = flats[j].line.indent;
			}
		}
	}

	const out: StyledLine[] = [];
	let dropped = 0;
	const flushDropped = () => {
		if (dropped > 0) {
			out.push({ indent: 0, gutter: " ", segments: [{ text: `… ${dropped} unchanged`, style: "unchanged" }] });
			dropped = 0;
		}
	};
	flats.forEach((f, i) => {
		if (keep[i]) {
			flushDropped();
			out.push(f.line);
		} else {
			dropped++;
		}
	});
	flushDropped();
	return out;
}
