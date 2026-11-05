import { VersionSpecifier } from "@effected/semver";
import { Data, Effect, Result } from "effect";
import type { PeerStrategy } from "../catalogs.js";

/**
 * Typed failure raised when a peer range cannot be derived from a range string.
 *
 * @internal
 */
export class PeerRangeError extends Data.TaggedError("PeerRangeError")<{ readonly message: string }> {}

/**
 * A non-fatal incompatibility surfaced by a peer derivation. The interactive
 * table annotates the row; `--yes` treats it as fatal.
 *
 * @internal
 */
export interface PeerWarning {
	readonly kind: "lock-minor-prerelease";
	readonly message: string;
}

/** The derived peer range plus any incompatibility encountered deriving it. @internal */
export interface PeerDerivation {
	readonly range: string;
	readonly warning: PeerWarning | null;
}

/** The operators a peer range can be derived from; `VersionSpecifier` also admits comparators such as `>=`. */
const DERIVABLE_OPERATORS: ReadonlySet<string> = new Set(["^", "~", ""]);

/**
 * Recompute a materialized peer range from a package range and a strategy.
 * "lock" pins to the exact version; "lock-minor" floors the patch to .0.
 * The operator (^/~/exact) is preserved.
 *
 * "lock" reuses the version text verbatim rather than rebuilding it from
 * major.minor.patch, so prerelease and build identifiers survive intact
 * (rebuilding would silently drop them and derive an unpublished range).
 *
 * "lock-minor" floors a stable version's patch to .0, which intentionally
 * drops any build metadata: `^6.5.1+build.7` derives to `^6.5.0`, not
 * `^6.5.0+build.7`. Build metadata identifies a specific build of 6.5.1, not
 * of the floored 6.5.0, and semver ignores build metadata when matching
 * ranges anyway, so carrying it forward would be misleading.
 *
 * "lock-minor" is not meaningful on a prerelease — flooring `3.0.0-next.8` to
 * `^3.0.0` yields a range that does not match `3.0.0-next.8` at all, excluding
 * the very version being catalogued. It therefore degrades to "lock" behavior
 * and reports a warning rather than emitting an unsatisfiable range.
 *
 * @internal
 */
export function derivePeerRange(range: string, strategy: PeerStrategy): Effect.Effect<PeerDerivation, PeerRangeError> {
	return Effect.gen(function* () {
		const spec = Result.getOrNull(VersionSpecifier.parseResult(range));
		if (spec === null || !DERIVABLE_OPERATORS.has(spec.operator)) {
			return yield* Effect.fail(new PeerRangeError({ message: `Cannot derive peer range from "${range}"` }));
		}
		const { operator: prefix, version: parsed } = spec;
		const version = range.slice(prefix.length);
		// "lock" reuses `version` verbatim rather than reconstructing from
		// components, so prerelease and build identifiers survive.
		if (strategy === "lock") {
			return { range: `${prefix}${version}`, warning: null };
		}
		// "lock-minor" floors the patch to .0, which is meaningless on a
		// prerelease (it would exclude the very version being catalogued), so it
		// degrades to reusing the verbatim version and reports a warning instead.
		if (parsed.prerelease.length > 0) {
			return {
				range: `${prefix}${version}`,
				warning: {
					kind: "lock-minor-prerelease" as const,
					message: `lock-minor cannot floor the prerelease "${version}" — pinned to the exact version instead`,
				},
			};
		}
		return { range: `${prefix}${parsed.major}.${parsed.minor}.0`, warning: null };
	});
}
