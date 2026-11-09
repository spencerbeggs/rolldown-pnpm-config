import { Data } from "effect";
import { parseSync } from "oxc-parser";
import type { Node } from "./ast.js";
import { findPluginArg, keyName, prop } from "./ast.js";
import type { CatalogEntry } from "./types.js";

/**
 * Typed failure raised when the config source cannot be parsed.
 *
 * @internal
 */
export class DiscoverError extends Data.TaggedError("DiscoverError")<{ readonly message: string }> {}

/** Matches a simple-operator range we can safely rewrite (`^x`, `~x`, or bare `x`). */
const SIMPLE_RANGE_RE = /^(\^|~|)(\d[\w.+-]*)$/;

function operatorOf(range: string): "^" | "~" | "" {
	if (range.startsWith("^")) return "^";
	if (range.startsWith("~")) return "~";
	return "";
}

/**
 * Statically discover the catalog version literals in a config source. Locates
 * the single `PnpmConfigPlugin(...)` call and walks `.catalogs.<name>.packages`.
 * Each package whose range is a simple-operator string literal yields a
 * CatalogEntry with byte-offset spans; anything else (computed value, complex
 * range) is reported in `skipped` as `<catalog>.<pkg>` and never throws.
 * `catalogs` names every declared catalog in source order, including one
 * that yields no entries, so `--catalog` can tell an empty catalog from a
 * typo. `skippedRefs` carries the same skips as `{ catalog, pkg }` pairs, so
 * a caller can scope them by catalog identity: the flattened string cannot
 * tell catalog `a` from a catalog named `a.b`.
 *
 * @internal
 */
export function discoverCatalogEntries(
	source: string,
	filename: string,
): {
	entries: CatalogEntry[];
	skipped: string[];
	skippedRefs: { catalog: string; pkg: string }[];
	catalogs: string[];
} {
	const result = parseSync(filename, source);
	if (result.errors.length > 0) {
		throw new DiscoverError({ message: result.errors.map((e) => e.message).join("; ") });
	}
	const program = result.program as unknown as Node;
	const entries: CatalogEntry[] = [];
	const skippedRefs: { catalog: string; pkg: string }[] = [];
	const declared: string[] = [];
	const finish = () => ({
		entries,
		skipped: skippedRefs.map((r) => `${r.catalog}.${r.pkg}`),
		skippedRefs,
		catalogs: declared,
	});

	const arg = findPluginArg(program);
	if (!arg) return finish();

	const catalogs = prop(arg, "catalogs");
	if (catalogs?.type !== "ObjectExpression") return finish();

	for (const catProp of (catalogs.properties as Node[]) ?? []) {
		if (catProp.type !== "Property") continue;
		const catalog = keyName(catProp.key as Node);
		if (catalog === undefined) continue;
		declared.push(catalog);
		const decl = catProp.value as Node;
		if (decl.type !== "ObjectExpression") continue;
		const packages = prop(decl, "packages");
		if (packages?.type !== "ObjectExpression") continue;

		for (const pkgProp of (packages.properties as Node[]) ?? []) {
			if (pkgProp.type !== "Property") continue;
			const pkg = keyName(pkgProp.key as Node);
			if (pkg === undefined) continue;
			const value = pkgProp.value as Node;

			// Resolve the range literal node and any peer/strategy/source.
			let rangeNode: Node | undefined;
			let peerNode: Node | undefined;
			let strategy: "lock" | "lock-minor" | "interop" | undefined;
			let source: "registry" | "workspace" | undefined;

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
				const src = prop(value, "source");
				if (src?.type === "Literal" && (src.value === "registry" || src.value === "workspace")) {
					source = src.value as "registry" | "workspace";
				}
			}

			if (!rangeNode || !SIMPLE_RANGE_RE.test(rangeNode.value as string)) {
				skippedRefs.push({ catalog, pkg });
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
				...(source ? { source } : {}),
			});
		}
	}

	return finish();
}
