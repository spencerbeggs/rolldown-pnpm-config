import { VersionSpecifier } from "@effected/semver";
import { Glob, Predicate, Result } from "effect";
import type { CatalogDeclaration } from "../catalogs.js";
import { rangeOf } from "../catalogs.js";

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
 * Every pinned member's catalog value is frozen to the version its override
 * names, so the catalog and the override always agree. pnpm never matches an
 * override against a `catalog:` specifier, so a catalog left at `~X.Y.Z`
 * would let a dependent writing `catalog:` resolve a newer patch than the
 * override pins everywhere else, and the graph would carry two copies. Only
 * the frozen output changes (the pnpmfile's `base`, `export`, `preview`): the
 * authored range stays what `upgrade` reads and rewrites, the `:peers`
 * catalog keeps its peer range, and an opted-in `:exact` catalog names the
 * pinned version. When a hand-authored override wins on the
 * selector, the catalog takes its value if that is an exact version and keeps
 * the authored range otherwise.
 *
 * `include` and `exclude` select which members are pinned, so one catalog can
 * hold both a release family that is pinned graph-wide and packages that are
 * not. Each entry is an exact package name or a glob pattern (`@effect/*`),
 * matched with `effect/Glob` against the whole name; `*` stays within the
 * scope or the bare name. A member matched by both lists is excluded. Every
 * entry must match at least one member, and an empty `include` is rejected,
 * so a typo throws instead of silently widening or narrowing the pin set.
 *
 * @public
 */
export interface OverridesFromCatalogs {
	/** The catalog whose members are pinned. */
	readonly catalog: string;
	/**
	 * Members to pin, as exact names or glob patterns (`effect`, `@effect/*`);
	 * the rest are skipped. Omitted, every member is a candidate.
	 */
	readonly include?: readonly string[];
	/**
	 * Members left out, as exact names or glob patterns, e.g. a tool that rides
	 * the catalog but is not part of the release family. Wins over `include`.
	 */
	readonly exclude?: readonly string[];
	/**
	 * How each selector is scoped. `"line"` (the default) qualifies the package
	 * name with its caret line, so only requests on that line are pinned;
	 * `"any"` emits the bare package name, which pins every request regardless
	 * of the line it asked for.
	 */
	readonly scope?: "line" | "any";
}

/** The simple operators that can pin: an optional `^`, `~`, `>=` or `=` on one version. */
const PINNABLE_OPERATORS: ReadonlySet<string> = new Set(["^", "~", ">=", "=", ""]);

/**
 * The release line a plain version belongs to: `^X.0.0`, or `^0.Y.0` when the
 * major is 0. A `0.0.Z` version has no caret line (`^0.0.0` admits only
 * `0.0.0` itself), so it takes the tilde line `~0.0.0`, which covers every
 * `0.0.Z` request.
 */
function releaseLine(major: number, minor: number): string {
	if (major !== 0) return `^${major}.0.0`;
	return minor === 0 ? "~0.0.0" : `^0.${minor}.0`;
}

/**
 * Compile a filter list into a member predicate, throwing when an entry
 * matches no member (an exact name or a pattern alike).
 */
function compileFilter(
	entries: readonly string[],
	members: readonly string[],
	label: "included" | "excluded",
	catalog: string,
): (name: string) => boolean {
	const globs = entries.map((entry) => {
		const glob = Glob.make(entry);
		if (!members.some((name) => Glob.match(glob, name))) {
			throw new Error(`overridesFromCatalogs: ${label} member "${entry}" is not in catalog "${catalog}"`);
		}
		return glob;
	});
	return (name) => globs.some((glob) => Glob.match(glob, name));
}

/**
 * One catalog member a directive pins: where it lives, the override selector
 * derived for it, and the version that selector pins.
 */
interface Pin {
	readonly catalog: string;
	readonly name: string;
	readonly selector: string;
	readonly version: string;
}

/** Derive the pins for one directive. Pure; throws when the catalog is absent or a filter entry matches nothing. */
function deriveOne(
	catalogs: Record<string, CatalogDeclaration>,
	{ catalog, include, exclude = [], scope = "line" }: OverridesFromCatalogs,
): Pin[] {
	const decl = catalogs[catalog];
	if (decl === undefined) {
		throw new Error(`overridesFromCatalogs: catalog "${catalog}" is not declared`);
	}
	if (include?.length === 0) {
		throw new Error(`overridesFromCatalogs: include for catalog "${catalog}" is empty, which would pin nothing`);
	}
	const members = Object.keys(decl.packages);
	const isIncluded = include === undefined ? () => true : compileFilter(include, members, "included", catalog);
	const isExcluded = compileFilter(exclude, members, "excluded", catalog);
	const pins: Pin[] = [];
	for (const [name, spec] of Object.entries(decl.packages)) {
		if (!isIncluded(name) || isExcluded(name)) continue;
		const parsed = Result.getOrNull(VersionSpecifier.parseResult(rangeOf(spec)));
		// A caret line cannot name a prerelease, and widening a compound range to
		// one version would pin more than the author asked for — so both are
		// skipped, never widened.
		if (parsed === null || !PINNABLE_OPERATORS.has(parsed.operator)) continue;
		const { version } = parsed;
		if (version.prerelease.length > 0 || version.build.length > 0) continue;
		const selector = scope === "any" ? name : `${name}@${releaseLine(version.major, version.minor)}`;
		pins.push({ catalog, name, selector, version: version.toString() });
	}
	return pins;
}

/** Every directive's pins, in directive order. */
function derivePins(
	catalogs: Record<string, CatalogDeclaration>,
	directives: OverridesFromCatalogs | readonly OverridesFromCatalogs[],
): Pin[] {
	const list = Array.isArray(directives) ? directives : [directives];
	return list.flatMap((d) => deriveOne(catalogs, d));
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
	const out: Record<string, string> = {};
	for (const pin of derivePins(catalogs, directives)) out[pin.selector] = pin.version;
	return out;
}

/** The exact version an override value names, or `null` for a range, alias or removal. */
function exactVersion(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const parsed = Result.getOrNull(VersionSpecifier.parseResult(value));
	if (parsed === null || (parsed.operator !== "" && parsed.operator !== "=")) return null;
	return parsed.version.toString();
}

/**
 * Freeze each pinned member's catalog value to the exact version its final
 * override names, so a `catalog:` specifier (which pnpm never matches against
 * an override) resolves the same version the override pins. Returns a new
 * catalogs map, and the `:exact` variant names the same version (a winner that
 * is not an exact version throws for a member that variant holds); `:peers`
 * catalogs and unpinned members pass through verbatim,
 * and a member whose winning override is not an exact version keeps its range.
 *
 * @internal
 */
export function pinCatalogs(
	resolved: Record<string, Record<string, string>>,
	overrides: unknown,
	directives: OverridesFromCatalogs | readonly OverridesFromCatalogs[] | undefined,
	catalogs: Record<string, CatalogDeclaration>,
): Record<string, Record<string, string>> {
	if (directives === undefined || !Predicate.isObject(overrides)) return resolved;
	const table = overrides as Record<string, unknown>;
	const out: Record<string, Record<string, string>> = { ...resolved };
	for (const { catalog, name, selector } of derivePins(catalogs, directives)) {
		const pinned = exactVersion(table[selector]);
		const current = out[catalog];
		const exact = out[`${catalog}:exact`];
		// A winner that is not an exact version leaves the exact catalog nothing
		// to name: its derived version may fall outside the override, and a
		// `catalog:<name>:exact` dependent would then resolve a second copy.
		if (pinned === null && exact !== undefined && name in exact) {
			throw new Error(
				`overridesFromCatalogs: override "${selector}" wins with ${JSON.stringify(table[selector])}, which is not an exact version, so catalog "${catalog}:exact" cannot name the version it pins; override with an exact version, or set exact: false on "${name}"`,
			);
		}
		if (pinned === null || current === undefined || !(name in current)) continue;
		out[catalog] = { ...current, [name]: pinned };
		// The exact variant names the same version, so `catalog:<name>:exact`
		// and the graph-wide pin never disagree.
		if (exact !== undefined && name in exact) out[`${catalog}:exact`] = { ...exact, [name]: pinned };
	}
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
	const manual = Predicate.isObject(authored) ? (authored as Record<string, string>) : {};
	return { ...derived, ...manual };
}
