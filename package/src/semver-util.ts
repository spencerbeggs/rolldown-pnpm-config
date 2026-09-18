import { Range, SemVer } from "@effected/semver";
import { Result } from "effect";

/**
 * Parse a version string synchronously, returning null instead of failing
 * (filters junk dist-tags and unparseable literals). Build-time only.
 *
 * @internal
 */
export const parseVersion = (v: string): SemVer | null => Result.getOrNull(SemVer.parseResult(v));

/**
 * Parse a range expression synchronously, returning null instead of failing.
 * Build-time only.
 *
 * @internal
 */
export const parseRange = (r: string): Range | null => Result.getOrNull(Range.parseResult(r));

/**
 * Strip a leading range operator to the bare version digits (e.g. `^3.17.0`
 * → `3.17.0`, `>=1.2.3 <2` → `1.2.3`). The single definition shared by the
 * plugin engine's peer-prefix transform and the CLI's floor derivations.
 *
 * @internal
 */
export const bareVersion = (range: string): string => range.replace(/^[\^~>=<\s]+/, "").split(/\s/)[0] ?? range;
