import type { PartialReleaseAgeGate } from "@effected/npm";

/**
 * Read a release-age gate from config and pnpm and combine it with
 * {@link @effected/npm#ReleaseAgeGate.combine}. The gate model itself
 * (`ReleaseAgeGate`, `PartialReleaseAgeGate`, the age filter, and the
 * `@pnpm/matcher` exclude semantics) lives in `@effected/npm`; this module
 * only turns this repo's two config sources into partial contributions.
 */

/** Unwrap a managed field that may be a bare value or a `{ value, enforcement }` FieldInput. */
function fieldValue(raw: unknown): unknown {
	if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw) {
		return (raw as { value: unknown }).value;
	}
	return raw;
}

/** Read the release-age gate declared in a statically-evaluated PnpmConfigPlugin config. @internal */
export function readConfigReleaseAge(config: Record<string, unknown> | null): PartialReleaseAgeGate | null {
	if (!config) return null;
	const age = fieldValue(config.minimumReleaseAge);
	const exc = fieldValue(config.minimumReleaseAgeExclude);
	const out: { ageMinutes?: number; exclude?: readonly string[] } = {};
	if (typeof age === "number" && Number.isFinite(age)) out.ageMinutes = age;
	if (Array.isArray(exc)) out.exclude = exc.filter((x): x is string => typeof x === "string");
	return out.ageMinutes === undefined && out.exclude === undefined ? null : out;
}

/** Parse `pnpm config get minimumReleaseAge[Exclude]` stdout into a PartialReleaseAgeGate. @internal */
export function parsePnpmGate(age: string | null, exclude: string | null): PartialReleaseAgeGate | null {
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
