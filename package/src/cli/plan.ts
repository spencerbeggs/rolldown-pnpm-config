import { Range, SemVer } from "@effected/semver";
import { Effect, Option } from "effect";
import { bareVersion, parseRange, parseVersion } from "../semver-util.js";
import type { PeerRangeError } from "./peer-range.js";
import { derivePeerRange } from "./peer-range.js";
import type { Candidate, CatalogEntry } from "./types.js";

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
		const range = parseRange(entry.currentRange);
		const current = parseVersion(bareVersion(entry.currentRange));
		const currentMajor = current?.major ?? 0;

		// When the entry is itself pinned to a prerelease, candidates include
		// prereleases on the SAME named track (e.g. "next"), so a next.8 pin can
		// advance to next.9. A stable entry never sees a prerelease.
		const track = current && current.prerelease.length > 0 ? String(current.prerelease[0]) : null;
		const onTrack = (v: SemVer) => track !== null && v.prerelease.length > 0 && String(v.prerelease[0]) === track;

		const parsed = versions.map(parseVersion).filter((sv): sv is SemVer => sv !== null && (sv.isStable || onTrack(sv)));

		const inRangeMax = range ? Option.getOrNull(Range.maxSatisfying(parsed, range)) : null;
		const sameMajorMax = Option.getOrNull(SemVer.max(parsed.filter((v) => v.major === currentMajor)));
		const overallMax = Option.getOrNull(SemVer.max(parsed));

		const withPeer = (version: string): Effect.Effect<string | undefined, PeerRangeError> =>
			entry.strategy && entry.strategy !== "interop"
				? derivePeerRange(`${entry.operator}${version}`, entry.strategy).pipe(Effect.map((d) => d.range))
				: Effect.succeed(undefined);

		const candidate = (kind: Candidate["kind"], sv: SemVer): Effect.Effect<Candidate, PeerRangeError> =>
			Effect.map(withPeer(sv.toString()), (peerRange) => ({
				kind,
				range: `${entry.operator}${sv}`,
				version: sv.toString(),
				isMajor: sv.major > currentMajor,
				...(peerRange ? { peerRange } : {}),
			}));

		const candidates: Candidate[] = [];

		if (inRangeMax && (current === null || inRangeMax.gt(current))) {
			candidates.push(yield* candidate("in-range", inRangeMax));
		}

		// The latest within the current major line but beyond the caret range, and
		// strictly below the overall latest — the meaningful intermediate for 0.x
		// packages whose caret locks the minor (so the table offers 0.50.0, not just
		// a jump from 0.49.x straight to the 1.0 major). Skipped when it coincides
		// with the in-range pick (e.g. a `^1.x` range already spans its whole major)
		// or the overall latest (no major bump available).
		if (sameMajorMax !== null) {
			const beatsCurrent = current === null || sameMajorMax.gt(current);
			const beatsInRange = inRangeMax === null || sameMajorMax.gt(inRangeMax);
			const belowOverall = overallMax?.gt(sameMajorMax) ?? false;
			if (beatsCurrent && beatsInRange && belowOverall) {
				candidates.push(yield* candidate("minor", sameMajorMax));
			}
		}

		if (overallMax && (current === null || overallMax.gt(current)) && (!inRangeMax || overallMax.gt(inRangeMax))) {
			candidates.push(yield* candidate("latest", overallMax));
		}

		candidates.push({
			kind: "keep",
			range: entry.currentRange,
			version: bareVersion(entry.currentRange),
			isMajor: false,
		});

		return candidates;
	});
}

/**
 * The non-interactive default pick for an entry: the latest in-range
 * candidate, or — for a workspace-sourced entry — the sole non-keep
 * candidate. A workspace entry tracks its workspace's single next version,
 * which for a 0.x caret routinely falls OUTSIDE the current range (`^0.2.0`
 * does not contain 0.3.0); the never-cross-a-range rule protects against
 * surprise REGISTRY majors, and the workspace version is this repo's own
 * declared next release. Undefined when nothing but keep is on offer.
 *
 * Shared by `--yes`/`--check` (runUpgrade) and the `--preview` / non-TTY
 * projection (projectDecisions) so the three can never disagree.
 *
 * @internal
 */
export function defaultPick(entry: CatalogEntry, candidates: readonly Candidate[]): Candidate | undefined {
	return entry.source === "workspace"
		? candidates.find((c) => c.kind !== "keep")
		: candidates.find((c) => c.kind === "in-range");
}
