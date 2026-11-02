import { locateWorkspaceRootSync } from "@effected/workspaces";
import { nodeSyncOps } from "@effected/workspaces/node-sync";
import type { YamlNode, YamlPath, YamlScalar } from "@effected/yaml";
import {
	Yaml,
	YamlDocument,
	YamlEdit,
	YamlFormat,
	YamlLint,
	YamlLintConfig,
	YamlStringifyOptions,
} from "@effected/yaml";
import { Option, Order, Predicate, Result } from "effect";

const FILENAME = "pnpm-workspace.yaml";
// lineWidth 0 disables wrapping (parity with the previous `yaml` renderer).
const STRINGIFY_OPTIONS = YamlStringifyOptions.make({ indent: 2, lineWidth: 0 });

/**
 * The lint config style inference resolves over: the renderer's historical
 * defaults (2-space, unindented sequences, single quotes), so a dimension the
 * source gives no votes to falls back to today's output rather than the lint
 * preset's double-quote default.
 */
const STYLE_BASE = YamlLintConfig.make({
	rules: {
		...YamlLintConfig.default.rules,
		indentation: { spaces: 2, indentSequences: false },
		"quoted-strings": { quoteType: "single" },
	},
});

/** True when every element is a string/number/boolean (safe to sort). */
function allPrimitive(arr: readonly unknown[]): boolean {
	return arr.every((v) => v === null || (typeof v !== "object" && typeof v !== "function"));
}

/**
 * Canonical form for deterministic output and diffing: object keys alpha-sorted
 * recursively; arrays of all-primitive elements sorted lexicographically;
 * arrays containing objects keep their order.
 *
 * @internal
 */
export function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		const mapped = value.map(canonicalize);
		return allPrimitive(mapped) ? [...mapped].sort((a, b) => Order.String(String(a), String(b))) : mapped;
	}
	if (Predicate.isObject(value)) {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => Order.String(a, b))
				.map(([k, v]) => [k, canonicalize(v)]),
		);
	}
	return value;
}

/**
 * Walk up from `startDir` to the nearest directory containing a
 * pnpm-workspace.yaml; returns the file path or null. A `package.json`
 * `workspaces` field is not a marker here: this tool targets pnpm only.
 *
 * @internal
 */
export function findWorkspaceFile(startDir: string): string | null {
	return locateWorkspaceRootSync(startDir, { ...nodeSyncOps, markers: [FILENAME] })?.path ?? null;
}

/** Parse pnpm-workspace.yaml source; empty/whitespace yields an empty object. @internal */
export function parseWorkspace(source: string): Record<string, unknown> {
	// A malformed document throws (YamlParseError), matching the previous
	// `yaml` parser's throw-on-error behavior.
	const parsed = Result.getOrThrow(Yaml.parseResult(source));
	return Predicate.isObject(parsed) ? (parsed as Record<string, unknown>) : {};
}

/**
 * Render a workspace object from scratch: deterministic key sort +
 * stringify. `options` defaults to the historical 2-space, unindented,
 * single-quoted style.
 *
 * @internal
 */
export function renderWorkspace(
	obj: Record<string, unknown>,
	options: YamlStringifyOptions = STRINGIFY_OPTIONS,
): string {
	return Result.getOrThrow(Yaml.stringifyResult(canonicalize(obj), options));
}

/**
 * The stringify options matching the style `source` already follows: indent
 * width, whether block sequences sit indented under their key, and quote
 * character. Lenient — a mixed file takes the dominant spelling — and a
 * dimension with no votes keeps the historical default.
 *
 * @internal
 */
export function inferWorkspaceStyle(source: string): YamlStringifyOptions {
	const { rules } = YamlLint.resolveLenient(YamlLint.observe(source, YamlLint.builtins), STYLE_BASE);
	const indentation = rules.indentation as { spaces?: unknown; indentSequences?: unknown };
	const quoted = rules["quoted-strings"] as { quoteType?: unknown };
	return YamlStringifyOptions.make({
		indent: typeof indentation.spaces === "number" ? indentation.spaces : 2,
		indentSequences: indentation.indentSequences === true,
		quoteStyle: quoted.quoteType === "double" ? "double" : "single",
		lineWidth: 0,
	});
}

/** Order-insensitive structural equality over canonical forms. */
function sameValue(a: unknown, b: unknown): boolean {
	return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/** A mapping (not a sequence, not null) — the only node the diff descends into. */
function isMapping(v: unknown): v is Record<string, unknown> {
	return Predicate.isObject(v) && !Array.isArray(v);
}

/** One planned write: the path and the new value (`undefined` removes). */
interface Change {
	readonly path: YamlPath;
	readonly value: unknown;
	/** True when the path's last segment is a mapping key the source lacks. */
	readonly newKey?: true;
}

/**
 * Per-item edits for a primitive sequence present on both sides: remove the
 * items `next` no longer holds (highest index first, so earlier indices stay
 * valid) and append the ones it adds, in canonical order. Every other item's
 * line is untouched. Matching is by multiset, so a reorder is not a change.
 */
function sequenceChanges(path: YamlPath, prev: readonly unknown[], next: readonly unknown[]): Change[] {
	const key = (v: unknown) => JSON.stringify(v);
	const pending = new Map<string, number>();
	for (const v of next) pending.set(key(v), (pending.get(key(v)) ?? 0) + 1);
	const removed: number[] = [];
	prev.forEach((v, i) => {
		const n = pending.get(key(v)) ?? 0;
		if (n > 0) pending.set(key(v), n - 1);
		else removed.push(i);
	});
	const added: unknown[] = [];
	for (const v of next) {
		const n = pending.get(key(v)) ?? 0;
		if (n > 0) {
			added.push(v);
			pending.set(key(v), n - 1);
		}
	}
	added.sort((a, b) => Order.String(String(a), String(b)));
	const changes: Change[] = added.map((v, i) => ({ path: [...path, prev.length + i], value: v }));
	for (const i of removed.reverse()) changes.push({ path: [...path, i], value: undefined });
	return changes;
}

/**
 * The minimal path-targeted changes taking `before` to `after`: descend
 * through mappings present on both sides, edit primitive sequences item by
 * item, and replace (or remove) any other value whose canonical form differs.
 */
function workspaceChanges(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	prefix: YamlPath = [],
): Change[] {
	const changes: Change[] = [];
	for (const key of Object.keys(before)) {
		if (!Object.hasOwn(after, key)) changes.push({ path: [...prefix, key], value: undefined });
	}
	for (const [key, next] of Object.entries(after)) {
		const path = [...prefix, key];
		if (!Object.hasOwn(before, key)) {
			changes.push({ path, value: canonicalize(next), newKey: true });
			continue;
		}
		const prev = before[key];
		if (sameValue(prev, next)) continue;
		if (isMapping(prev) && isMapping(next)) changes.push(...workspaceChanges(prev, next, path));
		else if (
			Array.isArray(prev) &&
			Array.isArray(next) &&
			next.length > 0 &&
			allPrimitive(prev) &&
			allPrimitive(next)
		) {
			changes.push(...sequenceChanges(path, prev, next));
		} else changes.push({ path, value: canonicalize(next) });
	}
	return changes;
}

/** Where a scalar sits: a mapping key, a mapping value, or a sequence item. */
type Role = "key" | "value" | "item";

/** Every scalar under `node`, with its role. */
function* scalarsOf(node: YamlNode | null, role: Role): Generator<readonly [YamlScalar, Role]> {
	if (node === null) return;
	if (node._tag === "YamlScalar") yield [node, role];
	else if (node._tag === "YamlMap") {
		for (const pair of node.items) {
			yield* scalarsOf(pair.key, "key");
			yield* scalarsOf(pair.value, "value");
		}
	} else if (node._tag === "YamlSeq") for (const item of node.items) yield* scalarsOf(item, "item");
}

/** True when `s` would render plain, i.e. quoting it is a style choice rather than a requirement. */
function couldBePlain(s: string): boolean {
	const out = Yaml.stringifyResult(s, STRINGIFY_OPTIONS);
	return Result.isSuccess(out) && !/^['"]/.test(out.success);
}

/**
 * The quoting vote over `scalars`: positive when, among strings that need no
 * quotes, more are quoted than plain. Strings that must be quoted (`@scope/*`)
 * cast no vote, so scalars quoted only where required read as plain.
 */
function quoteVote(scalars: Iterable<readonly [YamlScalar, Role]>): number {
	let vote = 0;
	for (const [scalar] of scalars) {
		if (typeof scalar.value !== "string" || !couldBePlain(scalar.value)) continue;
		vote += scalar.style === "plain" ? -1 : 1;
	}
	return vote;
}

/** The roles in which the whole document quotes strings by choice: the fallback when siblings give no vote. */
function quotedRoles(doc: YamlNode | null): ReadonlySet<Role> {
	const all = [...scalarsOf(doc, "value")];
	return new Set(
		(["key", "value", "item"] as const).filter((r) => quoteVote(all.filter(([, role]) => role === r)) > 0),
	);
}

/** `s` as a quoted scalar in the given quote character. */
function quote(s: string, style: "single" | "double"): string {
	return style === "double" ? JSON.stringify(s) : `'${s.replaceAll("'", "''")}'`;
}

/** The scalar directly at `node` (not nested), with its role. */
function directScalar(node: YamlNode | null, role: Role): Array<readonly [YamlScalar, Role]> {
	return node?._tag === "YamlScalar" ? [[node, role]] : [];
}

/**
 * Quote the plain string scalars a change just wrote, where the file quotes
 * by choice. The stringifier only quotes what it must, so without this a
 * catalog that quotes every key gains a bare `vitest:` beside `"effect":`.
 * The written node's own key, value or item follows its siblings' vote, which
 * keeps the choice local (a file can quote catalog keys yet leave top-level
 * keys plain); scalars nested deeper in a new subtree, or a node whose
 * siblings cast no vote, follow the whole document's roles. Only the written
 * subtree is touched (plus its key when the key is new).
 */
function requoteWritten(text: string, change: Change, docRoles: ReadonlySet<Role>, style: "single" | "double"): string {
	if (change.value === undefined) return text;
	const doc = YamlDocument.parseResult(text);
	if (Result.isFailure(doc) || doc.success.contents === null) return text;
	const root = doc.success.contents;
	const last = change.path[change.path.length - 1];
	const parent = change.path.length > 1 ? root.find(change.path.slice(0, -1)) : Option.some(root);
	if (Option.isNone(parent)) return text;
	const container = parent.value;
	const decide = (vote: number, role: Role) => (vote !== 0 ? vote > 0 : docRoles.has(role));
	const targets: Array<readonly [YamlScalar, boolean]> = [];
	const deep = (node: YamlNode | null) => {
		if (node === null || node._tag === "YamlScalar") return;
		for (const [scalar, role] of scalarsOf(node, "value")) targets.push([scalar, docRoles.has(role)]);
	};
	if (container._tag === "YamlMap") {
		const index = container.items.findIndex((p) => p.key._tag === "YamlScalar" && String(p.key.value) === String(last));
		const pair = container.items[index];
		if (pair === undefined) return text;
		const siblings = container.items.filter((_, i) => i !== index);
		if (change.newKey) {
			const vote = quoteVote(siblings.flatMap((p) => directScalar(p.key, "key")));
			for (const [scalar] of directScalar(pair.key, "key")) targets.push([scalar, decide(vote, "key")]);
		}
		const vote = quoteVote(siblings.flatMap((p) => directScalar(p.value, "value")));
		for (const [scalar] of directScalar(pair.value, "value")) targets.push([scalar, decide(vote, "value")]);
		deep(pair.value);
	} else if (container._tag === "YamlSeq" && typeof last === "number") {
		const item = container.items[last] ?? null;
		const vote = quoteVote(container.items.filter((_, i) => i !== last).flatMap((n) => directScalar(n, "item")));
		for (const [scalar] of directScalar(item, "item")) targets.push([scalar, decide(vote, "item")]);
		deep(item);
	}
	const edits = targets
		.filter(([s, quoted]) => quoted && s.style === "plain" && typeof s.value === "string" && s.tag === undefined)
		.map(([s]) => ({ offset: s.offset, length: s.length, content: quote(s.value as string, style) }))
		.sort((a, b) => b.offset - a.offset);
	let out = text;
	for (const e of edits) out = out.slice(0, e.offset) + e.content + out.slice(e.offset + e.length);
	return out;
}

/** True when some mapping in `node` holds two keys that read as the same string (`1:` and `'1':`). */
function hasCollidingKeys(node: YamlNode | null): boolean {
	if (node === null) return false;
	if (node._tag === "YamlMap") {
		const seen = new Set<string>();
		for (const { key, value } of node.items) {
			const k = key._tag === "YamlScalar" ? String(key.value) : JSON.stringify(key);
			if (seen.has(k)) return true;
			seen.add(k);
			if (hasCollidingKeys(value)) return true;
		}
	} else if (node._tag === "YamlSeq") return node.items.some(hasCollidingKeys);
	return false;
}

/**
 * True when `text` parses to exactly `next` (canonically) with no colliding
 * keys. The edit model and the parsed object can disagree — anchors and
 * aliases (a removed `&b` leaves a dangling `*b`; a splice under an anchor
 * changes every alias), merge keys, non-string keys — and this is the one
 * check that catches all of them.
 */
function faithful(text: string, next: Record<string, unknown>): boolean {
	const doc = YamlDocument.parseResult(text);
	if (Result.isFailure(doc) || hasCollidingKeys(doc.success.contents)) return false;
	const value = Yaml.parseResult(text);
	return Result.isSuccess(value) && sameValue(isMapping(value.success) ? value.success : {}, next);
}

/**
 * Splice a primitive into an existing scalar's own source span, keeping its
 * quotes and trailing comment. `modify` only splices when given no
 * document-shaping options (any `indent`/`indentSequences` sends it down the
 * whole-document path, which re-styles the replaced node and drops its
 * comment), so the splice is attempted unstyled and accepted only when every
 * edit stays inside the target scalar. `None` means "not a splice" — the
 * caller takes the styled path. Workaround for spencerbeggs/effected#1219.
 */
function spliceScalar(text: string, path: YamlPath, value: unknown): Option.Option<string> {
	if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return Option.none();
	const doc = YamlDocument.parseResult(text);
	if (Result.isFailure(doc) || doc.success.contents === null) return Option.none();
	const target = doc.success.contents.find(path);
	if (Option.isNone(target) || target.value._tag !== "YamlScalar") return Option.none();
	const { offset, length } = target.value;
	const edits = YamlFormat.modifyResult(text, path, value);
	if (Result.isFailure(edits)) return Option.none();
	const inside = edits.success.every((e) => e.offset >= offset && e.offset + e.length <= offset + length);
	return inside ? Option.some(YamlEdit.applyAll(text, edits.success)) : Option.none();
}

/** Apply every change as an edit; `None` when the editor refuses one. */
function applyChanges(source: string, changes: readonly Change[], style: YamlStringifyOptions): Option.Option<string> {
	const docRoot = YamlDocument.parseResult(source);
	const roles = Result.isSuccess(docRoot) ? quotedRoles(docRoot.success.contents) : new Set<Role>();
	const quoteChar = style.quoteStyle ?? "single";
	let text = source;
	for (const change of changes) {
		const spliced = change.newKey ? Option.none<string>() : spliceScalar(text, change.path, change.value);
		if (Option.isSome(spliced)) {
			text = spliced.value;
			continue;
		}
		const result = YamlFormat.modifyToStringResult(text, change.path, change.value, style);
		if (Result.isFailure(result)) return Option.none();
		text = requoteWritten(result.success, change, roles, quoteChar);
	}
	return Option.some(text);
}

/**
 * Write `next` over an existing pnpm-workspace.yaml `source` as targeted
 * edits rather than a re-render, so comments, key order and unchanged lines
 * survive. A changed scalar is spliced in place keeping its quotes and
 * comment; a primitive list gains or loses only the items that changed; and
 * inserted content takes the style the file already follows (see
 * {@link inferWorkspaceStyle}), including quoting keys, values or list items
 * where the file quotes them by choice. New keys append to their mapping, and
 * a CRLF file stays CRLF.
 *
 * An empty source renders from scratch exactly as {@link renderWorkspace}
 * does. A source with no mapping to edit, one the editor refuses
 * (multi-document, directives), or an edit result that does not parse back to
 * exactly `next` (anchors, merge keys, colliding keys) is re-rendered whole
 * in its inferred style instead.
 *
 * @internal
 */
export function writeWorkspace(source: string, next: Record<string, unknown>): string {
	if (source.trim() === "") return renderWorkspace(next);
	const parsed = Result.getOrThrow(Yaml.parseResult(source));
	const style = inferWorkspaceStyle(source);
	const crlf = source.includes("\r\n");
	const edited = isMapping(parsed)
		? applyChanges(source, workspaceChanges(parsed, next), style)
		: Option.none<string>();
	const text = Option.isSome(edited) && faithful(edited.value, next) ? edited.value : renderWorkspace(next, style);
	return crlf ? text.replace(/\r?\n/g, "\r\n") : text;
}
