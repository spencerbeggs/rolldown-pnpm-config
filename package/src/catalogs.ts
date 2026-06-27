/**
 * How the `upgrade` CLI recomputes a materialized peer range when the package
 * range is bumped. CLI-only metadata; the runtime ignores it.
 *
 * @public
 */
export type PeerStrategy = "lock" | "lock-minor";

/**
 * A package's version: a bare range, or an object carrying a materialized peer
 * range (`peer`) and optional CLI recompute `strategy`.
 *
 * @public
 */
export type CatalogPackageSpec =
	| string
	| { readonly range: string; readonly peer?: string; readonly strategy?: PeerStrategy };

/**
 * One catalog's declaration: a map of package name to version spec.
 *
 * @public
 */
export interface CatalogDeclaration {
	/** Map of package name to version spec or range object. */
	readonly packages: Record<string, CatalogPackageSpec>;
}

/**
 * Normalize declarative catalog input into the resolved `{ catalog → pkg → range }`
 * map consumed by the runtime. Pure: the base catalog uses each package's
 * `range` (or bare string); a `<name>Peers` catalog is emitted only for packages
 * carrying a materialized `peer`, using that value verbatim. `strategy` is
 * CLI-only and ignored here.
 *
 * @internal
 */
export function normalizeCatalogs(input: Record<string, CatalogDeclaration>): Record<string, Record<string, string>> {
	const out: Record<string, Record<string, string>> = {};
	for (const [name, decl] of Object.entries(input)) {
		const base: Record<string, string> = {};
		const peers: Record<string, string> = {};
		for (const [pkg, spec] of Object.entries(decl.packages)) {
			base[pkg] = typeof spec === "string" ? spec : spec.range;
			if (typeof spec === "object" && spec.peer !== undefined) {
				peers[pkg] = spec.peer;
			}
		}
		out[name] = base;
		if (Object.keys(peers).length > 0) {
			out[`${name}Peers`] = peers;
		}
	}
	return out;
}
