/**
 * Overlay the plugin's managed fields onto a parsed pnpm-workspace.yaml object.
 * Managed top-level fields overwrite; `catalogs` is overlaid by catalog name
 * (plugin names replace, local names are preserved); every other key in the
 * parsed file is kept verbatim. Nothing is deleted. Pure.
 *
 * @internal
 */
export function overlayWorkspace(
	managed: Record<string, unknown>,
	parsed: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = { ...parsed };
	for (const [key, value] of Object.entries(managed)) {
		if (key === "catalogs" && value && typeof value === "object") {
			const existing = (parsed.catalogs && typeof parsed.catalogs === "object" ? parsed.catalogs : {}) as Record<
				string,
				unknown
			>;
			out.catalogs = { ...existing, ...(value as Record<string, unknown>) };
		} else {
			out[key] = value;
		}
	}
	return out;
}
