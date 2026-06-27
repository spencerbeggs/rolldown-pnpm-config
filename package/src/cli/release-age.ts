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

/** Unwrap a managed field that may be a bare value or a `{ value, enforcement }` FieldInput. */
function fieldValue(raw: unknown): unknown {
	if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw) {
		return (raw as { value: unknown }).value;
	}
	return raw;
}

/** Read the release-age gate declared in a statically-evaluated PnpmConfigPlugin config. @internal */
export function readConfigReleaseAge(config: Record<string, unknown> | null): PartialGate | null {
	if (!config) return null;
	const age = fieldValue(config.minimumReleaseAge);
	const exc = fieldValue(config.minimumReleaseAgeExclude);
	const out: { ageMinutes?: number; exclude?: readonly string[] } = {};
	if (typeof age === "number" && Number.isFinite(age)) out.ageMinutes = age;
	if (Array.isArray(exc)) out.exclude = exc.filter((x): x is string => typeof x === "string");
	return out.ageMinutes === undefined && out.exclude === undefined ? null : out;
}

/** Parse `pnpm config get minimumReleaseAge[Exclude]` stdout into a PartialGate. @internal */
export function parsePnpmGate(age: string | null, exclude: string | null): PartialGate | null {
	const out: { ageMinutes?: number; exclude?: readonly string[] } = {};
	const trimmedAge = age?.trim();
	if (trimmedAge && trimmedAge !== "undefined") {
		const n = Number.parseInt(trimmedAge, 10);
		if (Number.isFinite(n)) out.ageMinutes = n;
	}
	const trimmedExc = exclude?.trim();
	if (trimmedExc && trimmedExc !== "undefined") {
		let list: string[] = [];
		try {
			const json = JSON.parse(trimmedExc) as unknown;
			list = Array.isArray(json) ? json.map(String) : [String(json)];
		} catch {
			list = trimmedExc.split(/[\s,]+/).filter(Boolean);
		}
		if (list.length) out.exclude = list;
	}
	return out.ageMinutes === undefined && out.exclude === undefined ? null : out;
}
