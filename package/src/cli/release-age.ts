/** Effective release-age gate: minutes a release must age, and exempt package patterns. @internal */
export interface ReleaseAgeGate {
	readonly ageMinutes: number;
	readonly exclude: readonly string[];
}

/** One source's contribution to the gate; absent fields contribute nothing. @internal */
// biome-ignore lint/style/useConsistentTypeDefinitions: type required by spec
export type PartialGate = { readonly ageMinutes?: number; readonly exclude?: readonly string[] };

/** Combine two sources: strictest age (max), widest exempt set (union). @internal */
export function combineReleaseAge(a: PartialGate | null, b: PartialGate | null): ReleaseAgeGate {
	const ages = [a?.ageMinutes, b?.ageMinutes].filter((n): n is number => typeof n === "number");
	const ageMinutes = ages.length ? Math.max(0, ...ages) : 0;
	const exclude = [...new Set([...(a?.exclude ?? []), ...(b?.exclude ?? [])])];
	return { ageMinutes, exclude };
}

/** Match a package name against exact names or `*`-globs (e.g. `@effect/*`). @internal */
export function matchesExclude(pkg: string, patterns: readonly string[]): boolean {
	for (const pat of patterns) {
		if (pat === pkg) return true;
		if (pat.includes("*")) {
			const re = new RegExp(`^${pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
			if (re.test(pkg)) return true;
		}
	}
	return false;
}

/**
 * Drop versions younger than the gate's cutoff (and versions with no publish
 * timestamp). No-op when the age is 0 or the package is exempt.
 *
 * @internal
 */
export function filterByReleaseAge(
	versions: readonly string[],
	times: Readonly<Record<string, string>>,
	gate: ReleaseAgeGate,
	pkg: string,
	now: number,
): string[] {
	if (gate.ageMinutes <= 0 || matchesExclude(pkg, gate.exclude)) return [...versions];
	const cutoff = now - gate.ageMinutes * 60_000;
	return versions.filter((v) => {
		const t = times[v];
		if (t === undefined) return false;
		const published = Date.parse(t);
		return Number.isFinite(published) && published <= cutoff;
	});
}
