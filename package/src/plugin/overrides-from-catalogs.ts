import type { CatalogDeclaration } from "../catalogs.js";
import { rangeOf } from "../catalogs.js";
import { bareVersion } from "../semver-util.js";

/**
 * A directive that derives pnpm `overrides` from a catalog, so every member of
 * a release family resolves to the catalog's exact version everywhere in a
 * consumer's graph: direct requests, transitive requests from other packages,
 * and peer edges alike. A catalog range alone cannot do that, since a caret
 * admits a newer member and a catalog never reaches a dependency's own
 * dependencies. For each member whose range is a simple operator on a plain
 * `X.Y.Z` version, an entry `"<name>@<selector>": "<X.Y.Z>"` is emitted.
 *
 * @remarks
 * Under the default `scope: "line"` the selector is the member's release line,
 * `^X.0.0` (`^0.Y.0` on a 0.x line, `~0.0.0` on 0.0.x), so a request for a *different* major
 * (or a prerelease, which no caret line admits) is left alone. Prerelease and
 * compound-range members are skipped rather than widened. An override entry
 * authored by hand wins over a derived one on the same selector, and the
 * consumer's own `overrides` still win over the plugin's at install time.
 *
 * @public
 */
export interface OverridesFromCatalogs {
	/** The catalog whose members are pinned. */
	readonly catalog: string;
	/** Members left out, e.g. a tool that rides the catalog but is not part of the release family. */
	readonly exclude?: readonly string[];
	/**
	 * How each selector is scoped. `"line"` (the default) qualifies the package
	 * name with its caret line, so only requests on that line are pinned;
	 * `"any"` emits the bare package name, which pins every request regardless
	 * of the line it asked for.
	 */
	readonly scope?: "line" | "any";
}

/** A plain release version: `X.Y.Z`, no prerelease, no build metadata. */
const PLAIN_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** A simple-operator range: an optional `^`, `~`, `>=` or `=` on one version. */
const SIMPLE_RANGE = /^(?:\^|~|>=|=)?\s*\d/;

/**
 * The release line a plain version belongs to: `^X.0.0`, or `^0.Y.0` when the
 * major is 0. A `0.0.Z` version has no caret line (`^0.0.0` admits only
 * `0.0.0` itself), so it takes the tilde line `~0.0.0`, which covers every
 * `0.0.Z` request.
 */
function releaseLine(major: string, minor: string): string {
	if (major !== "0") return `^${major}.0.0`;
	return minor === "0" ? "~0.0.0" : `^0.${minor}.0`;
}

/** Derive the overrides for one directive. Pure; throws when the catalog or an excluded member is absent. */
function deriveOne(
	catalogs: Record<string, CatalogDeclaration>,
	{ catalog, exclude = [], scope = "line" }: OverridesFromCatalogs,
): Record<string, string> {
	const decl = catalogs[catalog];
	if (decl === undefined) {
		throw new Error(`overridesFromCatalogs: catalog "${catalog}" is not declared`);
	}
	for (const name of exclude) {
		if (!(name in decl.packages)) {
			throw new Error(`overridesFromCatalogs: excluded member "${name}" is not in catalog "${catalog}"`);
		}
	}
	const excluded = new Set(exclude);
	const table: Record<string, string> = {};
	for (const [name, spec] of Object.entries(decl.packages)) {
		if (excluded.has(name)) continue;
		const range = rangeOf(spec);
		if (!SIMPLE_RANGE.test(range) || /\s/.test(range.trim())) continue;
		const version = bareVersion(range);
		const match = PLAIN_VERSION.exec(version);
		// A caret line cannot name a prerelease, and widening a compound range to
		// one version would pin more than the author asked for — so both are
		// skipped, never widened.
		if (match === null) continue;
		const selector = scope === "any" ? name : `${name}@${releaseLine(match[1] as string, match[2] as string)}`;
		table[selector] = version;
	}
	return table;
}

/**
 * Merge the derived overrides for one or more directives (later directives win
 * on a selector clash).
 *
 * @internal
 */
export function deriveOverrides(
	catalogs: Record<string, CatalogDeclaration>,
	directives: OverridesFromCatalogs | readonly OverridesFromCatalogs[],
): Record<string, string> {
	const list = Array.isArray(directives) ? directives : [directives];
	const out: Record<string, string> = {};
	for (const d of list) Object.assign(out, deriveOne(catalogs, d));
	return out;
}

/**
 * Resolve the `overrides` value a plugin ships: the derived table from the
 * directive, with the authored entries merged over it so a hand-written
 * selector wins. Without a directive the authored value passes through
 * untouched (by reference, so an absent field stays absent).
 *
 * @internal
 */
export function resolveOverrides(
	authored: unknown,
	directives: OverridesFromCatalogs | readonly OverridesFromCatalogs[] | undefined,
	catalogs: Record<string, CatalogDeclaration>,
): unknown {
	if (directives === undefined) return authored;
	const derived = deriveOverrides(catalogs, directives);
	const manual = authored !== null && typeof authored === "object" ? (authored as Record<string, string>) : {};
	return { ...derived, ...manual };
}
