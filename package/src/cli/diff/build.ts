import type { ChangeKind, DiffMeta, DiffNode } from "./types.js";

function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Worst kind among children: changed if any differs, added/removed if uniform, else unchanged. */
function rollup(children: readonly DiffNode[]): ChangeKind {
	if (children.length === 0) return "unchanged";
	if (children.every((c) => c.kind === "added")) return "added";
	if (children.every((c) => c.kind === "removed")) return "removed";
	return children.some((c) => c.kind !== "unchanged") ? "changed" : "unchanged";
}

/** Build every node under a value that exists only on one side (added or removed). */
function uniform(
	key: string,
	path: readonly string[],
	value: unknown,
	kind: "added" | "removed",
	tag?: DiffNode["tag"],
): DiffNode {
	const here = [...path, key];
	const side = kind === "added" ? { after: value } : { before: value };
	if (isObject(value)) {
		const children = Object.keys(value).map((k) => uniform(k, here, value[k], kind));
		return { key, path: here, kind, ...(tag ? { tag } : {}), children };
	}
	if (Array.isArray(value)) {
		const children = value.map((el) => ({ ...uniform(String(el), here, el, kind), arrayElement: true }) as DiffNode);
		return { key, path: here, kind, ...(tag ? { tag } : {}), children };
	}
	return { key, path: here, kind, ...(tag ? { tag } : {}), ...side };
}

/** Diff two arrays as sets keyed by stringified element. */
function diffArray(
	key: string,
	path: readonly string[],
	before: readonly unknown[],
	after: readonly unknown[],
	tag?: DiffNode["tag"],
): DiffNode {
	const here = [...path, key];
	const b = new Set(before.map(String));
	const a = new Set(after.map(String));
	const keys = [...new Set([...b, ...a])].sort((x, y) => x.localeCompare(y));
	const children: DiffNode[] = keys.map((el) => {
		const inB = b.has(el);
		const inA = a.has(el);
		const kind: ChangeKind = inB && inA ? "unchanged" : inA ? "added" : "removed";
		const side = inA ? { after: el } : { before: el };
		return { key: el, path: [...here, el], kind, arrayElement: true, ...side };
	});
	return { key, path: here, kind: rollup(children), ...(tag ? { tag } : {}), children };
}

function diffValue(
	key: string,
	path: readonly string[],
	before: unknown,
	after: unknown,
	tag?: DiffNode["tag"],
): DiffNode {
	const here = [...path, key];
	if (isObject(before) && isObject(after)) {
		const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((x, y) => x.localeCompare(y));
		const children = keys.map((k) => {
			if (!(k in before)) return uniform(k, here, after[k], "added");
			if (!(k in after)) return uniform(k, here, before[k], "removed");
			return diffValue(k, here, before[k], after[k]);
		});
		return { key, path: here, kind: rollup(children), ...(tag ? { tag } : {}), children };
	}
	if (Array.isArray(before) && Array.isArray(after)) {
		return diffArray(key, path, before, after, tag);
	}
	const same = JSON.stringify(before) === JSON.stringify(after);
	return {
		key,
		path: here,
		kind: same ? "unchanged" : "changed",
		...(tag ? { tag } : {}),
		before,
		after,
	};
}

/**
 * Compare two canonicalized workspace objects into a diff tree. Top-level keys
 * carry a `tag`: `local` when the key was sourced from `config.local`,
 * `unmanaged` when the key is not in the plugin-managed set.
 *
 * @internal
 */
export function buildDiff(before: Record<string, unknown>, after: Record<string, unknown>, meta: DiffMeta): DiffNode {
	const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((x, y) => x.localeCompare(y));
	const children = keys.map((k) => {
		const tag: DiffNode["tag"] | undefined = meta.localKeys.has(k)
			? "local"
			: meta.managedKeys.has(k)
				? undefined
				: "unmanaged";
		if (!(k in before)) return uniform(k, [], after[k], "added", tag);
		if (!(k in after)) return uniform(k, [], before[k], "removed", tag);
		return diffValue(k, [], before[k], after[k], tag);
	});
	return { key: "", path: [], kind: rollup(children), children };
}
