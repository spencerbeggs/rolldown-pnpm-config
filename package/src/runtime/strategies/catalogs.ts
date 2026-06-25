import type { Divergence, Strategy } from "../types.js";

/**
 * Merge each named catalog; child wins per package. Emits override divergences
 * when a local version differs from the Silk-managed one. Ports Silk
 * `merge-catalogs.ts`.
 *
 * @internal
 */
export const catalogs: Strategy = (base, local) => {
	const silk = (base ?? {}) as Record<string, Record<string, string>>;
	const child = (local ?? {}) as Record<string, Record<string, string>>;
	const divergences: Divergence[] = [];
	const merged: Record<string, Record<string, string>> = { ...child };
	for (const [name, entries] of Object.entries(silk)) {
		const childCat = child[name] ?? {};
		const out: Record<string, string> = { ...entries };
		for (const [pkg, childVersion] of Object.entries(childCat)) {
			const silkVersion = entries[pkg];
			if (silkVersion !== undefined && silkVersion !== childVersion) {
				divergences.push({
					setting: `catalogs.${name}.${pkg}`,
					silkValue: silkVersion,
					childValue: childVersion,
					detail: "Local version overrides the Silk-managed version.",
					kind: "override",
				});
			}
			out[pkg] = childVersion;
		}
		merged[name] = out;
	}
	return { merged, divergences };
};
