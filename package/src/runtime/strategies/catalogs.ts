import type { Divergence, Strategy } from "../types.js";
import { mergeMapDetect } from "./overrides.js";

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
		const cat = mergeMapDetect(`catalogs.${name}`, entries, child[name] ?? {});
		merged[name] = cat.merged;
		divergences.push(...cat.divergences);
	}
	return { merged, divergences };
};
