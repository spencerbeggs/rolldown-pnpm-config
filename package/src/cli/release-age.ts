import type { PartialReleaseAgeGate } from "@effected/npm";
import { isWrappedField } from "../plugin/freeze.js";

/**
 * Read a release-age gate from config and combine it with
 * {@link @effected/npm#ReleaseAgeGate.combine}. The gate model itself
 * (`ReleaseAgeGate`, `PartialReleaseAgeGate`, the age filter, and the
 * `@pnpm/matcher` exclude semantics) lives in `@effected/npm`; this module
 * only turns a plugin config into a partial contribution (pnpm's own settings
 * are read by `RegistryResolver.pnpmReleaseAge`, through `PnpmSettings`).
 */

/** Unwrap a managed field that may be a bare value or a `{ value, enforcement }` FieldInput. */
const fieldValue = (raw: unknown): unknown => (isWrappedField(raw) ? raw.value : raw);

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
