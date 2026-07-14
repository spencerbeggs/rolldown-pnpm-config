import { Effect } from "effect";
import { Range, SemVer } from "semver-effect";
import type { PeerRangeError } from "./peer-range.js";
import { derivePeerRange } from "./peer-range.js";
import type { Candidate, CatalogEntry } from "./types.js";

/** Parse a version, returning null instead of failing (filters junk tags). */
const parseOrNull = (v: string) => SemVer.parse(v).pipe(Effect.catchAll(() => Effect.succeed(null)));

/**
 * Compute the candidate versions for one catalog entry against the list of
 * published versions. Order: latest in-range (when newer than current), latest
 * overall stable (when newer than the in-range pick), then keep. Prereleases
 * are excluded. When the entry carries a strategy, each non-keep candidate gets
 * a recomputed `peerRange`.
 *
 * @internal
 */
export function planEntry(
	entry: CatalogEntry,
	versions: readonly string[],
): Effect.Effect<Candidate[], PeerRangeError> {
	return Effect.gen(function* () {
		const range = yield* Range.parse(entry.currentRange).pipe(Effect.catchAll(() => Effect.succeed(null)));

		const currentStripped = entry.currentRange.replace(/^[\^~]/, "");
		const current = yield* parseOrNull(currentStripped);
		const currentMajor = current?.major ?? 0;

		// When the entry is itself pinned to a prerelease, candidates include
		// prereleases on the SAME named track (e.g. "next"), so a next.8 pin can
		// advance to next.9. A stable entry never sees a prerelease.
		const track = current && current.prerelease.length > 0 ? String(current.prerelease[0]) : null;
		const onTrack = (v: SemVer) => track !== null && v.prerelease.length > 0 && String(v.prerelease[0]) === track;

		const parsed: SemVer[] = [];
		for (const v of versions) {
			const sv = yield* parseOrNull(v);
			if (sv && (sv.isStable || onTrack(sv))) parsed.push(sv);
		}
		parsed.sort((a, b) => a.compare(b)); // ascending
		const maxOf = (list: SemVer[]) => (list.length ? list[list.length - 1] : null);

		const inRangeMax = range ? maxOf(parsed.filter((v) => range.test(v))) : null;
		const overallMax = maxOf(parsed);

		const withPeer = (version: string): Effect.Effect<string | undefined, PeerRangeError> =>
			entry.strategy && entry.strategy !== "interop"
				? derivePeerRange(`${entry.operator}${version}`, entry.strategy).pipe(Effect.map((d) => d.range))
				: Effect.succeed(undefined);

		const candidates: Candidate[] = [];

		if (inRangeMax && (current === null || inRangeMax.gt(current))) {
			const version = inRangeMax.toString();
			const peerRange = yield* withPeer(version);
			candidates.push({
				kind: "in-range",
				range: `${entry.operator}${version}`,
				version,
				isMajor: inRangeMax.major > currentMajor,
				...(peerRange ? { peerRange } : {}),
			});
		}

		if (overallMax && (current === null || overallMax.gt(current)) && (!inRangeMax || overallMax.gt(inRangeMax))) {
			const version = overallMax.toString();
			const peerRange = yield* withPeer(version);
			candidates.push({
				kind: "latest",
				range: `${entry.operator}${version}`,
				version,
				isMajor: overallMax.major > currentMajor,
				...(peerRange ? { peerRange } : {}),
			});
		}

		candidates.push({
			kind: "keep",
			range: entry.currentRange,
			version: entry.currentRange.replace(/^[\^~]/, ""),
			isMajor: false,
		});

		return candidates;
	});
}
