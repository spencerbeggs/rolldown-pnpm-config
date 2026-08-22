import type { CatalogEntry } from "./types.js";

/**
 * Route-aware key for the resolved-version maps returned by
 * `resolveGatedVersions`. The same package name can appear workspace-sourced
 * in one catalog and registry-sourced in another, and the two routes resolve
 * through DIFFERENT resolvers to different version lists (with different
 * release-age-gate treatment) — so the maps key each (pkg × route) pair
 * separately. The registry route keys by the bare package name; `:` can never
 * appear in an npm package name, so the prefixed workspace form cannot collide.
 *
 * @internal
 */
export function versionKeyOf(entry: Pick<CatalogEntry, "pkg" | "source">): string {
	return entry.source === "workspace" ? `workspace:${entry.pkg}` : entry.pkg;
}
