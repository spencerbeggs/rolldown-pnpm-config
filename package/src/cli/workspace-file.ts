import { locateWorkspaceRootSync } from "@effected/workspaces";
import { nodeSyncOps } from "@effected/workspaces/node-sync";
import type { YamlPath } from "@effected/yaml";
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

/**
 * The minimal path-targeted changes taking `before` to `after`: descend
 * through mappings present on both sides, and replace (or remove, with
 * `undefined`) any other value whose canonical form differs. Sequences are
 * replaced whole, in canonical order.
 */
function workspaceChanges(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	prefix: YamlPath = [],
): Array<readonly [YamlPath, unknown]> {
	const changes: Array<readonly [YamlPath, unknown]> = [];
	for (const key of Object.keys(before)) {
		if (!Object.hasOwn(after, key)) changes.push([[...prefix, key], undefined]);
	}
	for (const [key, next] of Object.entries(after)) {
		const prev = before[key];
		const path = [...prefix, key];
		if (Object.hasOwn(before, key) && isMapping(prev) && isMapping(next)) {
			changes.push(...workspaceChanges(prev, next, path));
		} else if (!Object.hasOwn(before, key) || !sameValue(prev, next)) {
			changes.push([path, canonicalize(next)]);
		}
	}
	return changes;
}

/**
 * Splice a primitive into an existing scalar's own source span, keeping its
 * quotes and trailing comment. `modify` only splices when given no
 * document-shaping options (any `indent`/`indentSequences` sends it down the
 * whole-document path, which re-styles the replaced node and drops its
 * comment), so the splice is attempted unstyled and accepted only when every
 * edit stays inside the target scalar. `None` means "not a splice" — the
 * caller takes the styled path.
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

/**
 * Write `next` over an existing pnpm-workspace.yaml `source` as targeted
 * edits rather than a re-render, so comments, key order and unchanged lines
 * survive: a changed scalar is spliced in place keeping its quotes and
 * comment, and
 * inserted or replaced subtrees take the style the file already follows
 * (see {@link inferWorkspaceStyle}). New keys append to their mapping.
 *
 * An empty source (or one with no mapping to edit) renders from scratch
 * exactly as {@link renderWorkspace} does; a source the editor refuses
 * (multi-document, directives) is re-rendered in its inferred style.
 *
 * @internal
 */
export function writeWorkspace(source: string, next: Record<string, unknown>): string {
	if (source.trim() === "") return renderWorkspace(next);
	const parsed = Result.getOrThrow(Yaml.parseResult(source));
	const style = inferWorkspaceStyle(source);
	if (!isMapping(parsed)) return renderWorkspace(next, style);
	let text = source;
	for (const [path, value] of workspaceChanges(parsed, next)) {
		const spliced = spliceScalar(text, path, value);
		if (Option.isSome(spliced)) {
			text = spliced.value;
			continue;
		}
		const result = YamlFormat.modifyToStringResult(text, path, value, style);
		if (Result.isFailure(result)) return renderWorkspace(next, style);
		text = result.success;
	}
	return text;
}
