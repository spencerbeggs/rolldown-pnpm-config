/** Recursively sort object keys for deterministic output; arrays keep order. */
export function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, sortKeys(v)]),
		);
	}
	return value;
}

/** Source for the `catalogs` virtual module: a sorted Map literal (plain-JS branch). */
export function emitCatalogsModule(catalogs: Record<string, Record<string, string>>): string {
	const sorted = sortKeys(catalogs) as Record<string, Record<string, string>>;
	const outer = Object.entries(sorted)
		.map(([name, entries]) => {
			const inner = Object.entries(entries)
				.map(([pkg, range]) => `[${JSON.stringify(pkg)}, ${JSON.stringify(range)}]`)
				.join(", ");
			return `[${JSON.stringify(name)}, new Map([${inner}])]`;
		})
		.join(", ");
	return `export const catalogs = new Map([${outer}]);\n`;
}

/** Source for the `pnpmfile` virtual module: createHooks over base + manifest. */
export function emitPnpmfileModule(base: Record<string, unknown>, manifest: Record<string, unknown>): string {
	const b = JSON.stringify(sortKeys(base));
	const m = JSON.stringify(sortKeys(manifest));
	return [
		'import { createHooks } from "rolldown-pnpm-config/runtime";',
		`export const hooks = createHooks(${b}, ${m});`,
		"",
	].join("\n");
}
