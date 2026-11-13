import type { PartialReleaseAgeGate } from "@effected/pnpm";
import { Option, Schema } from "effect";
import { isWrappedField } from "../plugin/freeze.js";
import { FIELD_SCHEMAS } from "../registry.js";

/**
 * Read a release-age gate from config and combine it with
 * `ReleaseAgeGate.combine`. The gate model itself
 * (`ReleaseAgeGate`, `PartialReleaseAgeGate`, the age filter, and the
 * `@pnpm/matcher` exclude semantics) lives in `@effected/pnpm`; this module
 * only turns a plugin config into a partial contribution (pnpm's own settings
 * are read by `RegistryResolver.pnpmReleaseAge`, through `PnpmSettings`).
 */

/** Unwrap a managed field that may be a bare value or a `{ value, enforcement }` FieldInput. */
const fieldValue = (raw: unknown): unknown => (isWrappedField(raw) ? raw.value : raw);

/**
 * The value `freeze` would ship for a release-age field: decoded through its
 * pnpm settings catalog schema, so `"1440"` reads as `1440` here exactly as it
 * does in the build. A value the schema refuses contributes nothing; the build
 * refuses it.
 */
const decodedField = (field: "minimumReleaseAge" | "minimumReleaseAgeExclude", raw: unknown): unknown =>
	raw === undefined ? undefined : Option.getOrUndefined(Schema.decodeUnknownOption(FIELD_SCHEMAS[field])(raw));

/** Read the release-age gate declared in a statically-evaluated PnpmConfigPlugin config. @internal */
export function readConfigReleaseAge(config: Record<string, unknown> | null): PartialReleaseAgeGate | null {
	if (!config) return null;
	const age = decodedField("minimumReleaseAge", fieldValue(config.minimumReleaseAge));
	const exc = decodedField("minimumReleaseAgeExclude", fieldValue(config.minimumReleaseAgeExclude));
	const out: { ageMinutes?: number; exclude?: readonly string[] } = {};
	if (typeof age === "number") out.ageMinutes = age;
	if (Array.isArray(exc)) out.exclude = exc.filter((x): x is string => typeof x === "string");
	return out.ageMinutes === undefined && out.exclude === undefined ? null : out;
}
