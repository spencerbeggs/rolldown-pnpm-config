import { VersionSpecifier } from "@effected/semver";
import { Result } from "effect";

/**
 * How the `upgrade` CLI recomputes a materialized peer range when the package
 * range is bumped. CLI-only metadata; the runtime ignores it.
 *
 * @public
 */
export type PeerStrategy = "lock" | "lock-minor" | "interop";

/**
 * Where a catalog entry's `range` is resolved from by the `upgrade` CLI.
 * `"registry"` (the default when omitted) queries published versions;
 * `"workspace"` reads the local workspace's NEXT release versions (current
 * manifest versions overlaid with pending changeset bumps). Orthogonal to
 * `strategy`, which governs how `peer` is derived from `range` — collapsing
 * the two would drop peer materialization entirely. CLI-only metadata; the
 * runtime ignores it.
 *
 * @public
 */
export type VersionSource = "registry" | "workspace";

/**
 * A package's version: a bare range, or an object carrying a materialized peer
 * range (`peer`), optional CLI recompute `strategy`, optional CLI version
 * `source`, and an optional `exact` escape for a catalog that opts into the
 * exact variant.
 *
 * @public
 */
export type CatalogPackageSpec =
	| string
	| {
			readonly range: string;
			readonly peer?: string;
			readonly strategy?: PeerStrategy;
			readonly source?: VersionSource;
			/**
			 * The entry's value in the `<name>:exact` catalog, for a range that names
			 * no single version (`">=1.2.0 <2.0.0"`), or `false` to leave the entry
			 * out of that catalog. Only valid when the declaration sets
			 * `exact: true`, and a plain version is rejected on a range the exact
			 * value already derives from, since `upgrade` rewrites `range` and
			 * would leave a hand-written value stale.
			 */
			readonly exact?: string | false;
	  };

/**
 * One catalog's declaration: a map of package name to version spec.
 *
 * @public
 */
export interface CatalogDeclaration {
	/** Map of package name to version spec or range object. */
	readonly packages: Record<string, CatalogPackageSpec>;
	/**
	 * Also emit `<name>:exact`, holding each entry's range with its operator
	 * stripped (`^0.34.0` becomes `0.34.0`), so a dependent writing
	 * `catalog:<name>:exact` publishes an exact version that still follows the
	 * catalog. Only a single comparator (`^`, `~`, `>=`, `=` or none) on one
	 * version derives; any other range fails the build unless its entry sets
	 * `exact` (a value only where `upgrade` never rewrites the range). Where `overridesFromCatalogs` pins a member, the exact catalog
	 * names the pinned version.
	 */
	readonly exact?: boolean;
}

/**
 * The install range of a catalog spec (bare string or `{ range }` object).
 *
 * @internal
 */
export const rangeOf = (spec: CatalogPackageSpec): string => (typeof spec === "string" ? spec : spec.range);

/**
 * Matches a range the `upgrade` CLI discovers and rewrites: a simple operator
 * (`^`, `~` or none) on a version, partials like `^1.2` and `1.x` included.
 * Shared so the build and `upgrade` agree on which ranges move under an
 * upgrade.
 *
 * @internal
 */
export const REWRITABLE_RANGE_RE = /^(\^|~|)(\d[\w.+-]*)$/;

/** The operators whose single version an exact pin can be read from. */
const EXACT_OPERATORS: ReadonlySet<string> = new Set(["^", "~", ">=", "=", ""]);

/** The single version a range names, or `null` when it names none (compound, wildcard, tag, `<`, `>`). */
function singleVersionOf(range: string): string | null {
	const parsed = Result.getOrNull(VersionSpecifier.parseResult(range));
	if (parsed === null || !EXACT_OPERATORS.has(parsed.operator)) return null;
	return parsed.version.toString();
}

/** The `<name>:exact` value of one entry, `undefined` to leave it out; throws on an entry with no single version. */
function exactEntry(catalog: string, pkg: string, spec: CatalogPackageSpec): string | undefined {
	const range = rangeOf(spec);
	const derived = singleVersionOf(range);
	const explicit = typeof spec === "object" ? spec.exact : undefined;
	if (explicit === false) return undefined;
	const rewritable = REWRITABLE_RANGE_RE.test(range);
	if (explicit !== undefined) {
		if (derived !== null) {
			throw new Error(
				`catalogs: "${pkg}" in catalog "${catalog}" derives its exact version ${derived} from "${range}"; remove its exact value, which upgrade would leave stale`,
			);
		}
		// An explicit value is only safe on a range upgrade never rewrites: once
		// upgrade turns `^1.2` into `^1.5.0`, the range derives and the explicit
		// value becomes the error above, so the upgrade itself would break the build.
		if (rewritable) {
			throw new Error(
				`catalogs: "${pkg}" in catalog "${catalog}" has range "${range}", which upgrade rewrites; an exact value would go stale, so write the range as a full version, or set exact: false`,
			);
		}
		const parsed = Result.getOrNull(VersionSpecifier.parseResult(explicit));
		if (parsed === null || parsed.operator !== "") {
			throw new Error(
				`catalogs: exact value "${explicit}" for "${pkg}" in catalog "${catalog}" is not a plain version`,
			);
		}
		return explicit;
	}
	if (derived === null && rewritable) {
		throw new Error(
			`catalogs: catalog "${catalog}" sets exact: true, but "${pkg}" has range "${range}", which names no single version; write the range as a full version, or set exact: false to leave it out`,
		);
	}
	if (derived === null) {
		throw new Error(
			`catalogs: catalog "${catalog}" sets exact: true, but "${pkg}" has range "${range}", which names no single version; set exact to a version, or exact: false to leave it out`,
		);
	}
	return derived;
}

/**
 * Normalize declarative catalog input into the resolved `{ catalog → pkg → range }`
 * map consumed by the runtime. Pure: the base catalog uses each package's
 * `range` (or bare string); a peers catalog is emitted only for packages
 * carrying a materialized `peer`, using that value verbatim, under the
 * `<name>:peers` colon-delimited name. A declaration with `exact: true` also
 * emits `<name>:exact`, each range with its operator stripped. `strategy` is
 * CLI-only and ignored here. Throws when an exact-opted entry names no single
 * version, or when an entry sets `exact` in a catalog that has not opted in.
 *
 * @internal
 */
export function normalizeCatalogs(input: Record<string, CatalogDeclaration>): Record<string, Record<string, string>> {
	const out: Record<string, Record<string, string>> = {};
	for (const [name, decl] of Object.entries(input)) {
		// Defensive: an untyped JS consumer (or a future reserved key) may place a
		// non-declaration sibling inside `catalogs` — a function, or an object with
		// no `packages` map. It must be IGNORED, not thrown on: the failure mode
		// "catalog silently not found" is already indistinguishable from "nothing
		// to update", so crashing here would be strictly worse. The discover walk
		// in the upgrade CLI skips such siblings the same way.
		if (typeof decl !== "object" || decl === null || typeof decl.packages !== "object" || decl.packages === null) {
			continue;
		}
		const base: Record<string, string> = {};
		const peers: Record<string, string> = {};
		const exact: Record<string, string> = {};
		for (const [pkg, spec] of Object.entries(decl.packages)) {
			base[pkg] = typeof spec === "string" ? spec : spec.range;
			if (typeof spec === "object" && spec.peer !== undefined) {
				peers[pkg] = spec.peer;
			}
			if (decl.exact === true) {
				const value = exactEntry(name, pkg, spec);
				if (value !== undefined) exact[pkg] = value;
			} else if (typeof spec === "object" && spec.exact !== undefined) {
				throw new Error(
					`catalogs: "${pkg}" sets exact, but catalog "${name}" does not set exact: true, so it would be ignored`,
				);
			}
		}
		out[name] = base;
		if (Object.keys(peers).length > 0) {
			out[`${name}:peers`] = peers;
		}
		if (Object.keys(exact).length > 0) {
			out[`${name}:exact`] = exact;
		}
	}
	return out;
}
