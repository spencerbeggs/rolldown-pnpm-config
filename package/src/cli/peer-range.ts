import { Data, Effect } from "effect";
import { SemVer } from "semver-effect";
import type { PeerStrategy } from "../catalogs.js";

/**
 * Typed failure raised when a peer range cannot be derived from a range string.
 *
 * @internal
 */
export class PeerRangeError extends Data.TaggedError("PeerRangeError")<{ readonly message: string }> {}

/** Splits a simple range into its operator prefix and version (e.g. `^6.5.1`). */
const PREFIX_RE = /^(\^|~|)(\d.*)$/;

/**
 * Recompute a materialized peer range from a package range and a strategy.
 * "lock" pins to the exact version; "lock-minor" floors the patch to .0.
 * The operator (^/~/exact) is preserved.
 *
 * Note: expects a release (non-prerelease) version string; a prerelease tag
 * would be dropped by the major.minor.patch reconstruction.
 *
 * @internal
 */
export function derivePeerRange(range: string, strategy: PeerStrategy): Effect.Effect<string, PeerRangeError> {
	return Effect.gen(function* () {
		const match = PREFIX_RE.exec(range);
		if (!match) {
			return yield* Effect.fail(new PeerRangeError({ message: `Cannot derive peer range from "${range}"` }));
		}
		const [, prefix, version] = match;
		const parsed = yield* SemVer.parse(version).pipe(
			Effect.mapError(() => new PeerRangeError({ message: `Invalid version in range "${range}"` })),
		);
		return strategy === "lock"
			? `${prefix}${parsed.major}.${parsed.minor}.${parsed.patch}`
			: `${prefix}${parsed.major}.${parsed.minor}.0`;
	});
}
