import { Data } from "effect";
import { parseSync } from "oxc-parser";
import type { CatalogEntry } from "./types.js";

/**
 * Typed failure raised when the config source cannot be parsed.
 *
 * @internal
 */
export class DiscoverError extends Data.TaggedError("DiscoverError")<{ readonly message: string }> {}

/** Matches a simple-operator range we can safely rewrite (`^x`, `~x`, or bare `x`). */
const SIMPLE_RANGE_RE = /^(\^|~|)(\d[\w.+-]*)$/;

// Minimal shapes for the oxc ESTree nodes we traverse. oxc nodes carry numeric
// `start`/`end` byte offsets into the source string (spans include quotes for
// string literals).
interface Node {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly [k: string]: unknown;
}

function operatorOf(range: string): "^" | "~" | "" {
	if (range.startsWith("^")) return "^";
	if (range.startsWith("~")) return "~";
	return "";
}

/**
 * Find a property value by key name in an ObjectExpression node.
 * Handles both Identifier keys (unquoted) and Literal keys (quoted).
 */
function prop(obj: Node, key: string): Node | undefined {
	const properties = (obj.properties as Node[]) ?? [];
	for (const p of properties) {
		if (p.type !== "Property") continue;
		const k = p.key as Node;
		const name = k.type === "Identifier" ? (k.name as string) : k.type === "Literal" ? String(k.value) : undefined;
		if (name === key) return p.value as Node;
	}
	return undefined;
}

/** Find the first `PnpmConfigPlugin(...)` CallExpression's first argument object. */
function findPluginArg(program: Node): Node | undefined {
	let found: Node | undefined;
	const visit = (node: unknown): void => {
		if (found || node === null || typeof node !== "object") return;
		const n = node as Node;
		if (n.type === "CallExpression") {
			const callee = n.callee as Node | undefined;
			if (callee?.type === "Identifier" && (callee.name as string) === "PnpmConfigPlugin") {
				const args = n.arguments as Node[];
				if (args?.[0]?.type === "ObjectExpression") {
					found = args[0];
					return;
				}
			}
		}
		for (const value of Object.values(n)) {
			if (Array.isArray(value)) value.forEach(visit);
			else if (value && typeof value === "object") visit(value);
		}
	};
	visit(program);
	return found;
}

/**
 * Statically discover the catalog version literals in a config source. Locates
 * the single `PnpmConfigPlugin(...)` call and walks `.catalogs.<name>.packages`.
 * Each package whose range is a simple-operator string literal yields a
 * CatalogEntry with byte-offset spans; anything else (computed value, complex
 * range) is reported in `skipped` as `<catalog>.<pkg>` and never throws.
 *
 * @internal
 */
export function discoverCatalogEntries(
	source: string,
	filename: string,
): { entries: CatalogEntry[]; skipped: string[] } {
	const result = parseSync(filename, source);
	if (result.errors.length > 0) {
		throw new DiscoverError({ message: result.errors.map((e) => e.message).join("; ") });
	}
	const program = result.program as unknown as Node;
	const entries: CatalogEntry[] = [];
	const skipped: string[] = [];

	const arg = findPluginArg(program);
	if (!arg) return { entries, skipped };

	const catalogs = prop(arg, "catalogs");
	if (catalogs?.type !== "ObjectExpression") return { entries, skipped };

	for (const catProp of (catalogs.properties as Node[]) ?? []) {
		if (catProp.type !== "Property") continue;
		const catKey = catProp.key as Node;
		const catalog = catKey.type === "Identifier" ? (catKey.name as string) : String(catKey.value);
		const decl = catProp.value as Node;
		if (decl.type !== "ObjectExpression") continue;
		const packages = prop(decl, "packages");
		if (packages?.type !== "ObjectExpression") continue;

		for (const pkgProp of (packages.properties as Node[]) ?? []) {
			if (pkgProp.type !== "Property") continue;
			const pkgKey = pkgProp.key as Node;
			const pkg = pkgKey.type === "Identifier" ? (pkgKey.name as string) : String(pkgKey.value);
			const value = pkgProp.value as Node;

			// Resolve the range literal node and any peer/strategy.
			let rangeNode: Node | undefined;
			let peerNode: Node | undefined;
			let strategy: "lock" | "lock-minor" | "interop" | undefined;

			if (value.type === "Literal" && typeof value.value === "string") {
				rangeNode = value;
			} else if (value.type === "ObjectExpression") {
				const r = prop(value, "range");
				if (r?.type === "Literal" && typeof r.value === "string") rangeNode = r;
				const p = prop(value, "peer");
				if (p?.type === "Literal" && typeof p.value === "string") peerNode = p;
				const s = prop(value, "strategy");
				if (s?.type === "Literal" && (s.value === "lock" || s.value === "lock-minor" || s.value === "interop")) {
					strategy = s.value as "lock" | "lock-minor" | "interop";
				}
			}

			if (!rangeNode || !SIMPLE_RANGE_RE.test(rangeNode.value as string)) {
				skipped.push(`${catalog}.${pkg}`);
				continue;
			}

			const currentRange = rangeNode.value as string;

			entries.push({
				catalog,
				pkg,
				currentRange,
				operator: operatorOf(currentRange),
				rangeSpan: [rangeNode.start, rangeNode.end] as [number, number],
				...(peerNode
					? { peer: { value: peerNode.value as string, span: [peerNode.start, peerNode.end] as [number, number] } }
					: {}),
				...(strategy ? { strategy } : {}),
			});
		}
	}

	return { entries, skipped };
}
