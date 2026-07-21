import { Range, SemVer } from "@effected/semver";
import { Effect } from "effect";
import type { FetchPeer } from "./interop.js";
import { INTEROP_PEER_CONCURRENCY } from "./interop.js";

/** One in-group peer requirement: a dep this member peers on, at a range. @internal */
export interface PeerReq {
	readonly dep: string;
	readonly range: string;
}

/**
 * A pre-fetched, pre-parsed model of one interop catalog group. Everything the
 * live table needs to recompute peer floors and conflicts SYNCHRONOUSLY as the
 * user changes selections: peer requirements per candidate version, plus parsed
 * SemVer / Range objects (parsing is Effectful, comparison/testing is not).
 *
 * @internal
 */
export interface GroupModel {
	/** The package names in this interop group. */
	readonly members: ReadonlySet<string>;
	/** In-group peer requirements keyed by `"pkg@version"` (deps outside the group dropped). */
	readonly peerReqs: ReadonlyMap<string, readonly PeerReq[]>;
	/** Parsed SemVer per bare version string (candidate versions + declared floors); null = unparseable. */
	readonly ver: ReadonlyMap<string, SemVer | null>;
	/** Parsed Range per peer range string; null = unparseable. */
	readonly rng: ReadonlyMap<string, Range | null>;
}

/** The live-computed peer floor and any conflict for each group member. @internal */
export interface GroupPeers {
	/** Peer floor to write per member pkg (always caret, e.g. `^0.96.0`). */
	readonly peer: ReadonlyMap<string, string>;
	/** Human message per member pkg whose current pick violates an in-group peer. */
	readonly conflict: ReadonlyMap<string, string>;
}

/** Strip a range operator to its bare version digits (e.g. `^3.17.0` → `3.17.0`). */
function floorOf(range: string): string {
	return range.replace(/^[\^~>=\s]+/, "").split(/\s/)[0] ?? range;
}

/**
 * Recompute each member's peer floor and conflict for the current selection —
 * synchronously, from a pre-built {@link GroupModel}. Mirrors `deriveFloors`
 * (peer floor is the LOWEST floor any in-group member declares for a package,
 * else `^<its selected version>`) and `violations` (a member conflicts when its
 * selected version's in-group peer requirement is not satisfied by the current
 * pick of that dep). Never changes a selection — detection only.
 *
 * @internal
 */
export function computeGroupPeers(model: GroupModel, selected: ReadonlyMap<string, string>): GroupPeers {
	const declaredFloors = new Map<string, string[]>();
	for (const m of model.members) {
		const v = selected.get(m);
		if (v === undefined) continue;
		for (const { dep, range } of model.peerReqs.get(`${m}@${v}`) ?? []) {
			const list = declaredFloors.get(dep) ?? [];
			list.push(floorOf(range));
			declaredFloors.set(dep, list);
		}
	}

	const peer = new Map<string, string>();
	for (const m of model.members) {
		const v = selected.get(m);
		if (v === undefined) continue;
		const declared = declaredFloors.get(m);
		if (declared?.length) {
			let minStr = declared[0] as string;
			let minSv = model.ver.get(minStr) ?? null;
			for (const f of declared.slice(1)) {
				const sv = model.ver.get(f) ?? null;
				if (sv && (minSv === null || sv.compare(minSv) < 0)) {
					minSv = sv;
					minStr = f;
				}
			}
			peer.set(m, `^${minStr}`);
		} else {
			peer.set(m, `^${v}`);
		}
	}

	const conflict = new Map<string, string>();
	for (const m of model.members) {
		const v = selected.get(m);
		if (v === undefined) continue;
		const bad: string[] = [];
		for (const { dep, range } of model.peerReqs.get(`${m}@${v}`) ?? []) {
			const dv = selected.get(dep);
			if (dv === undefined) continue;
			const r = model.rng.get(range) ?? null;
			const sv = model.ver.get(dv) ?? null;
			if (!(r && sv && r.test(sv))) bad.push(`${dep} ${range}`);
		}
		if (bad.length) conflict.set(m, bad.join(", "));
	}

	return { peer, conflict };
}

/**
 * Build a {@link GroupModel} for one interop catalog group: fetch the
 * peerDependencies of every member's candidate version (in-group deps only) via
 * the shared memoized `fetchPeer`, then pre-parse every version and range string
 * so the table can recompute floors/conflicts without further Effects.
 *
 * @internal
 */
export function buildGroupModel(
	candidatesByPkg: ReadonlyMap<string, readonly string[]>,
	fetchPeer: FetchPeer,
): Effect.Effect<GroupModel, never> {
	return Effect.gen(function* () {
		const members = new Set(candidatesByPkg.keys());
		const peerReqs = new Map<string, PeerReq[]>();
		const verStrings = new Set<string>();
		const rngStrings = new Set<string>();

		// Fetch every (member, candidate) peerDeps concurrently — the memoized
		// fetchPeer dedups repeats. Sequential fetching would stall the table entry.
		const pairs: Array<readonly [string, string]> = [];
		for (const [pkg, versions] of candidatesByPkg) for (const v of versions) pairs.push([pkg, v] as const);
		const fetched = yield* Effect.forEach(
			pairs,
			([pkg, v]) => fetchPeer(pkg, v).pipe(Effect.map((deps) => [pkg, v, deps] as const)),
			{ concurrency: INTEROP_PEER_CONCURRENCY },
		);
		for (const [pkg, v, deps] of fetched) {
			verStrings.add(v);
			const reqs: PeerReq[] = [];
			for (const [dep, range] of Object.entries(deps)) {
				if (!members.has(dep)) continue;
				reqs.push({ dep, range });
				rngStrings.add(range);
				verStrings.add(floorOf(range));
			}
			peerReqs.set(`${pkg}@${v}`, reqs);
		}

		const ver = new Map<string, SemVer | null>();
		for (const s of verStrings) {
			ver.set(s, yield* SemVer.parse(s).pipe(Effect.catch(() => Effect.succeed(null))));
		}
		const rng = new Map<string, Range | null>();
		for (const s of rngStrings) {
			rng.set(s, yield* Range.parse(s).pipe(Effect.catch(() => Effect.succeed(null))));
		}

		return { members, peerReqs, ver, rng };
	});
}
