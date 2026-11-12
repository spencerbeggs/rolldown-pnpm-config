import type { Divergence, Strategy } from "../types.js";
import { mergeMapDetect } from "./overrides.js";
import { singleVersionOf } from "./single-version.js";

/**
 * Merge each named catalog; child wins per package. Emits override divergences
 * when a local version differs from the managed one.
 *
 * `options.exactCatalogs` lists the catalogs whose managed `<name>:exact`
 * variant was derived from their ranges at build time. A local override of
 * `<name>.<pkg>` naming a single version re-derives `<name>:exact.<pkg>` (only
 * where the managed exact catalog carries `<pkg>`, and an explicit local
 * `<name>:exact` entry wins). Without the option nothing is re-derived.
 * `<name>:peers` is authored separately and is never re-derived; the
 * divergence only notes that it keeps its managed value.
 *
 * @internal
 */
export const catalogs: Strategy = (base, local, _ctx, options) => {
	const managed = (base ?? {}) as Record<string, Record<string, string>>;
	const child = (local ?? {}) as Record<string, Record<string, string>>;
	const exactNames = new Set(Array.isArray(options?.exactCatalogs) ? (options.exactCatalogs as string[]) : []);
	const divergences: Divergence[] = [];
	const merged: Record<string, Record<string, string>> = { ...child };
	const followed = new Map<string, Record<string, string>>();
	for (const [name, entries] of Object.entries(managed)) {
		const cat = mergeMapDetect(`catalogs.${name}`, entries, child[name] ?? {});
		merged[name] = cat.merged;
		const managedExact = exactNames.has(name) ? managed[`${name}:exact`] : undefined;
		const managedPeers = managed[`${name}:peers`];
		const derived: Record<string, string> = {};
		for (const d of cat.divergences) {
			const pkg = d.setting.slice(`catalogs.${name}.`.length);
			const notes: string[] = [];
			if (managedExact?.[pkg] !== undefined && child[`${name}:exact`]?.[pkg] !== undefined) {
				notes.push(`The local ${name}:exact entry sets it instead.`);
			} else if (managedExact?.[pkg] !== undefined) {
				const version = singleVersionOf(d.localValue);
				if (version !== null) {
					derived[pkg] = version;
					notes.push(`${name}:exact followed it to ${version}.`);
				} else {
					notes.push(`${name}:exact was left at its managed value (${managedExact[pkg]}).`);
				}
			}
			if (managedPeers?.[pkg] !== undefined) {
				notes.push(`${name}:peers keeps its managed value.`);
			}
			divergences.push(notes.length > 0 ? { ...d, detail: `${d.detail} ${notes.join(" ")}` } : d);
		}
		followed.set(`${name}:exact`, derived);
	}
	// A re-derived value sits under the managed exact entry but beneath any
	// explicit local `<name>:exact` entry, which already won in the merge above.
	for (const [exactName, derived] of followed) {
		if (Object.keys(derived).length === 0 || managed[exactName] === undefined) continue;
		merged[exactName] = { ...merged[exactName], ...derived, ...(child[exactName] ?? {}) };
	}
	return { merged, divergences };
};
