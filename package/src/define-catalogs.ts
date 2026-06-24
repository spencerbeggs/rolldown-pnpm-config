/**
 * A package's version, as a bare range or an object (with optional peer mode).
 *
 * @public
 */
export type CatalogPackageSpec = string | { readonly range: string; readonly peer?: "lock-to-minor" };

/**
 * One named catalog declaration.
 *
 * @public
 */
export interface CatalogInput {
	/** The catalog name used as the key in the generated `pnpm-workspace.yaml`. */
	readonly name: string;
	/** When true, also emit a `<name>Peers` catalog. M1: a pass-through copy. */
	readonly peers?: boolean;
	/** Map of package name to version spec or range object. */
	readonly packages: Record<string, CatalogPackageSpec>;
}

/**
 * Normalized catalogs: catalog name → package → resolved range.
 *
 * @public
 */
export interface CatalogsResult {
	/** The resolved catalog map keyed by catalog name. */
	readonly catalogs: Record<string, Record<string, string>>;
}

/**
 * Normalize declarative catalog input. M1: `peers: true` duplicates the base
 * ranges as `<name>Peers`; range widening (lock-to-minor) is deferred to M2.
 *
 * @public
 */
export function defineCatalogs(inputs: readonly CatalogInput[]): CatalogsResult {
	const catalogs: Record<string, Record<string, string>> = {};
	for (const input of inputs) {
		const entries: Record<string, string> = {};
		for (const [pkg, spec] of Object.entries(input.packages)) {
			// M1 takes only the range. `spec.peer` ("lock-to-minor") is intentionally
			// ignored here — peer-range widening is the M2 seam (spec §4.2).
			entries[pkg] = typeof spec === "string" ? spec : spec.range;
		}
		catalogs[input.name] = entries;
		if (input.peers) {
			catalogs[`${input.name}Peers`] = { ...entries };
		}
	}
	return { catalogs };
}
