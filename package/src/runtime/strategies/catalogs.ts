import type { Divergence, Strategy } from "../types.js";

/**
 * Merge each named catalog; child wins per package. Emits override divergences
 * when a local version differs from the managed one.
 *
 * @internal
 */
export const catalogs: Strategy = (base, local) => {
	const managed = (base ?? {}) as Record<string, Record<string, string>>;
	const child = (local ?? {}) as Record<string, Record<string, string>>;
	const divergences: Divergence[] = [];
	const merged: Record<string, Record<string, string>> = { ...child };
	for (const [name, entries] of Object.entries(managed)) {
		const childCat = child[name] ?? {};
		const out: Record<string, string> = { ...entries };
		for (const [pkg, childVersion] of Object.entries(childCat)) {
			const managedVersion = entries[pkg];
			if (managedVersion !== undefined && managedVersion !== childVersion) {
				divergences.push({
					setting: `catalogs.${name}.${pkg}`,
					managedValue: managedVersion,
					localValue: childVersion,
					detail: "Local version overrides the managed version.",
					kind: "override",
				});
			}
			out[pkg] = childVersion;
		}
		merged[name] = out;
	}
	return { merged, divergences };
};
