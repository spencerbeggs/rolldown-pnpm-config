import type { CatalogDeclaration, CatalogPackageSpec } from "../catalogs.js";

/**
 * A directive that derives `peerDependencyRules.allowedVersions` rules from a
 * catalog. For each catalog entry with an exact pinned version, a version-
 * qualified rule `"<name>@<pin>><peer>"` is emitted, valued at the `peer`
 * package's own catalog version (optionally re-prefixed) — retiring the "unmet
 * peer on a fast prerelease line" warning class without ever masking a
 * genuinely-unmet range: pnpm applies a qualified rule only when the parent
 * instance's version satisfies the exact qualifier, so a same-named satellite on
 * a different version line keeps its real complaint.
 *
 * @public
 */
export interface AllowedVersionsFromCatalogs {
	/** The catalog whose entries supply the rules. */
	readonly catalog: string;
	/** The peer package each rule targets; its own version becomes the rule value and it gets no rule of its own. */
	readonly peer: string;
	/**
	 * Operator applied to the derived peer value. Omit to use the peer's catalog
	 * value verbatim (`4.0.0-beta.99` stays exact, `^3.0.0` stays `^3.0.0`); set
	 * `"^"` / `"~"` / `">="` etc. to strip the existing operator and apply this
	 * one; set `null` or `""` to strip to an exact version.
	 */
	readonly prefix?: string | null;
}

/** An exact version: no range operator, no wildcard — `X.Y.Z` with an optional prerelease. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** The install range of a catalog spec (bare string or `{ range }` object). */
const rangeOf = (spec: CatalogPackageSpec): string => (typeof spec === "string" ? spec : spec.range);

/** Strip a leading range operator to the bare version digits (e.g. `^3.17.0` → `3.17.0`). */
const bareVersion = (range: string): string => range.replace(/^[\^~>=<\s]+/, "").split(/\s/)[0] ?? range;

/** Apply the `prefix` transform to a peer value: verbatim, re-prefixed, or stripped to exact. */
function applyPrefix(peerValue: string, prefix: string | null | undefined): string {
	if (prefix === undefined) return peerValue;
	const bare = bareVersion(peerValue);
	return prefix === null || prefix === "" ? bare : `${prefix}${bare}`;
}

/** Derive the rules for one directive. Pure; throws when the catalog or peer is absent. */
function deriveOne(
	catalogs: Record<string, CatalogDeclaration>,
	{ catalog, peer, prefix }: AllowedVersionsFromCatalogs,
): Record<string, string> {
	const decl = catalogs[catalog];
	if (decl === undefined) {
		throw new Error(`allowedVersionsFromCatalogs: catalog "${catalog}" is not declared`);
	}
	const peerSpec = decl.packages[peer];
	if (peerSpec === undefined) {
		throw new Error(`allowedVersionsFromCatalogs: peer "${peer}" is not in catalog "${catalog}"`);
	}
	const value = applyPrefix(rangeOf(peerSpec), prefix);
	const table: Record<string, string> = {};
	for (const [name, spec] of Object.entries(decl.packages)) {
		if (name === peer) continue;
		const range = rangeOf(spec);
		// The qualifier must be exact to match the specific pinned parent instance;
		// a range cannot qualify one exactly, and widening would recreate the masking
		// risk — so non-exact entries are skipped, never widened.
		if (!EXACT_VERSION.test(range)) continue;
		table[`${name}@${range}>${peer}`] = value;
	}
	return table;
}

/** Merge the derived rules for one or more directives (later directives win on a key clash). */
export function deriveAllowedVersions(
	catalogs: Record<string, CatalogDeclaration>,
	directives: AllowedVersionsFromCatalogs | readonly AllowedVersionsFromCatalogs[],
): Record<string, string> {
	const list = Array.isArray(directives) ? directives : [directives];
	const out: Record<string, string> = {};
	for (const d of list) Object.assign(out, deriveOne(catalogs, d));
	return out;
}

/**
 * Resolve a `peerDependencyRules` value carrying an `allowedVersionsFromCatalogs`
 * directive: derive the rules from the catalogs, merge them into `allowedVersions`
 * (an explicitly authored entry wins on a key clash), and strip the directive so
 * the cleaned value passes the `peerDependencyRules` schema. Any value without the
 * directive passes through untouched.
 *
 * @internal
 */
export function resolvePeerDependencyRules(value: unknown, catalogs: Record<string, CatalogDeclaration>): unknown {
	if (value === null || typeof value !== "object" || !("allowedVersionsFromCatalogs" in value)) return value;
	const { allowedVersionsFromCatalogs, ...rest } = value as {
		allowedVersionsFromCatalogs: AllowedVersionsFromCatalogs | readonly AllowedVersionsFromCatalogs[];
		allowedVersions?: Record<string, string>;
	};
	const derived = deriveAllowedVersions(catalogs, allowedVersionsFromCatalogs);
	const merged = { ...derived, ...(rest.allowedVersions ?? {}) }; // manual entries win
	return { ...rest, ...(Object.keys(merged).length > 0 ? { allowedVersions: merged } : {}) };
}
