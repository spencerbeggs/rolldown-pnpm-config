import { Effect } from "effect";
import { Range, SemVer } from "semver-effect";
import type { CatalogEntry, Edit } from "./types.js";

/** Maximum number of concurrent peerDependencies fetches inside runInterop. @internal */
export const INTEROP_PEER_CONCURRENCY = 8;

/** Synchronous lookup of already-fetched peerDependencies for a (pkg, version). @internal */
export type PeerDepsOf = (pkg: string, version: string) => Record<string, string>;

/**
 * Effectful, memoized peer-deps lookup used inside resolveGroup / deriveFloors /
 * violations. On a cache hit the Effect returns immediately (synchronous-speed);
 * on a miss it fetches from the resolver, stores into the shared cache, and
 * returns. Callers never double-fetch the same key.
 *
 * @internal
 */
export type FetchPeer = (pkg: string, version: string) => Effect.Effect<Record<string, string>, never>;

/** Strip a range operator to its bare version digits (e.g. `^3.17.0` → `3.17.0`). */
function floorOf(range: string): string {
	return range.replace(/^[\^~>=\s]+/, "").split(/\s/)[0] ?? range;
}

/**
 * Derive each member's caret-capped peer floor: the lowest floor any in-group
 * member declares for it, or `^<its resolved version>` when no member peers on
 * it.
 *
 * @internal
 */
export function deriveFloors(
	resolved: ReadonlyMap<string, string>,
	fetchPeer: FetchPeer,
): Effect.Effect<Map<string, string>, never> {
	return Effect.gen(function* () {
		const floors = new Map<string, string[]>();
		for (const [pkg, version] of resolved) {
			const peers = yield* fetchPeer(pkg, version);
			for (const [dep, range] of Object.entries(peers)) {
				if (!resolved.has(dep)) continue; // in-group filter
				const list = floors.get(dep) ?? [];
				list.push(floorOf(range));
				floors.set(dep, list);
			}
		}
		const out = new Map<string, string>();
		for (const [pkg, version] of resolved) {
			const declared = floors.get(pkg);
			if (declared?.length) {
				const parsed = yield* Effect.forEach(declared, (f) =>
					SemVer.parse(f).pipe(
						Effect.map((sv) => ({ f, sv })),
						Effect.catchAll(() => Effect.succeed(null)),
					),
				);
				const valid = parsed.filter((x): x is { f: string; sv: SemVer } => x !== null);
				valid.sort((a, b) => a.sv.compare(b.sv));
				out.set(pkg, `^${valid[0]?.f ?? version}`);
			} else {
				out.set(pkg, `^${version}`);
			}
		}
		return out;
	});
}

export interface GroupMember {
	readonly pkg: string;
	readonly ceiling: string;
	readonly candidates: readonly string[];
}
export interface InteropConflict {
	readonly pkg: string;
	readonly ceiling: string;
	readonly blockedBy: string;
}
export interface GroupResolution {
	readonly resolved: ReadonlyMap<string, string>;
	readonly conflicts: readonly InteropConflict[];
}

/** Does `version` satisfy `range`? Unparseable input is treated as not-satisfied. */
function satisfies(version: string, range: string): Effect.Effect<boolean, never> {
	return Effect.gen(function* () {
		const r = yield* Range.parse(range).pipe(Effect.catchAll(() => Effect.succeed(null)));
		if (!r) return false;
		const v = yield* SemVer.parse(version).pipe(Effect.catchAll(() => Effect.succeed(null)));
		return v ? r.test(v) : false;
	});
}

/**
 * In-group peers of (pkg@version) that the current resolution violates, as
 * "dep@range" strings. Uses the Effectful `fetchPeer` so it fetches on-demand
 * only when a candidate version's peer-deps have not yet been cached.
 */
function violations(
	pkg: string,
	version: string,
	resolved: ReadonlyMap<string, string>,
	memberSet: ReadonlySet<string>,
	fetchPeer: FetchPeer,
): Effect.Effect<string[], never> {
	return Effect.gen(function* () {
		const out: string[] = [];
		for (const [dep, range] of Object.entries(yield* fetchPeer(pkg, version))) {
			if (!memberSet.has(dep)) continue;
			const rv = resolved.get(dep);
			if (rv === undefined) continue;
			if (!(yield* satisfies(rv, range))) out.push(`${dep}@${range}`);
		}
		return out;
	});
}

/**
 * Reconcile a group's chosen versions against their cross-peerDependencies by
 * downgrading dependents only. Ceilings are never raised and peer targets are
 * never downgraded; unsatisfiable members become conflicts.
 *
 * @internal
 */
export function resolveGroup(
	members: readonly GroupMember[],
	fetchPeer: FetchPeer,
): Effect.Effect<GroupResolution, never> {
	return Effect.gen(function* () {
		const memberSet = new Set(members.map((m) => m.pkg));
		const resolved = new Map<string, string>(members.map((m) => [m.pkg, m.ceiling]));
		const ceilingOf = new Map(members.map((m) => [m.pkg, m.ceiling]));

		const leq = (a: string, b: string): Effect.Effect<boolean, never> =>
			Effect.gen(function* () {
				const av = yield* SemVer.parse(a).pipe(Effect.catchAll(() => Effect.succeed(null)));
				const bv = yield* SemVer.parse(b).pipe(Effect.catchAll(() => Effect.succeed(null)));
				return av && bv ? av.compare(bv) <= 0 : false;
			});

		const maxIter = members.reduce((n, m) => n + m.candidates.length, 0) + members.length + 1;
		for (let i = 0; i < maxIter; i++) {
			let changed = false;
			for (const m of members) {
				const cur = resolved.get(m.pkg) as string;
				if ((yield* violations(m.pkg, cur, resolved, memberSet, fetchPeer)).length === 0) continue;
				// search candidates ≤ ceiling, highest first, for a satisfying version
				const ceiling = ceilingOf.get(m.pkg) as string;
				const eligible: string[] = [];
				for (const c of m.candidates) if (yield* leq(c, ceiling)) eligible.push(c);
				const sorted = yield* sortDesc(eligible);
				let pick: string | null = null;
				for (const c of sorted) {
					if ((yield* violations(m.pkg, c, resolved, memberSet, fetchPeer)).length === 0) {
						pick = c;
						break;
					}
				}
				if (pick !== null && pick !== cur) {
					resolved.set(m.pkg, pick);
					changed = true;
				}
			}
			if (!changed) break;
		}

		const conflicts: InteropConflict[] = [];
		for (const m of members) {
			const cur = resolved.get(m.pkg) as string;
			const v = yield* violations(m.pkg, cur, resolved, memberSet, fetchPeer);
			if (v.length > 0) {
				conflicts.push({ pkg: m.pkg, ceiling: m.ceiling, blockedBy: v.join(", ") });
			}
		}
		for (const c of conflicts) {
			resolved.set(c.pkg, ceilingOf.get(c.pkg) as string);
		}
		return { resolved, conflicts };
	});
}

/** Sort version strings descending; unparseable ones sink to the end. */
function sortDesc(versions: readonly string[]): Effect.Effect<string[], never> {
	return Effect.gen(function* () {
		const parsed = yield* Effect.forEach(versions, (v) =>
			SemVer.parse(v).pipe(
				Effect.map((sv) => ({ v, sv })),
				Effect.catchAll(() => Effect.succeed({ v, sv: null })),
			),
		);
		parsed.sort((a, b) => (a.sv && b.sv ? b.sv.compare(a.sv) : a.sv ? -1 : 1));
		return parsed.map((p) => p.v);
	});
}

export interface InteropResolver {
	readonly peerDependencies: (pkg: string, version: string) => Effect.Effect<Record<string, string>, unknown>;
}
export interface InteropResult {
	readonly resolved: ReadonlyMap<string, string>;
	readonly peers: ReadonlyMap<string, string>;
	readonly conflicts: readonly InteropConflict[];
	/** Synchronous lookup into the fetch cache used during this resolution. @internal */
	readonly peerDepsOf: PeerDepsOf;
}

/**
 * Fetch the peerDependencies needed to reconcile one catalog interop group,
 * then run the pure resolve + floor derivation. Failures degrade to empty
 * peerDeps (the member resolves at its ceiling).
 *
 * Phase 1 now prefetches only the ceiling version of each member (one
 * `pnpm view` call per member) instead of every candidate version ≤ ceiling.
 * `resolveGroup` / `violations` fetch lower versions on-demand via the shared
 * `fetchPeer` Effectful memoized lookup — they are only consulted when a
 * downgrade search probes them, which for real-world interop groups (where most
 * members are compatible at their ceilings) reduces the total call count from
 * O(N × |candidates|) to O(N + |downgraded members| × depth).
 *
 * A `(pkg, version)` peerDeps lookup is immutable, so the optional `cache` may
 * be shared across the interactive re-entry rounds: each round only fetches the
 * keys a prior round did not, sparing the sequential `pnpm view` calls for
 * versions already seen. Omitting it yields a fresh per-call cache.
 *
 * @internal
 */
export function runInterop(
	members: readonly GroupMember[],
	resolver: InteropResolver,
	cache: Map<string, Record<string, string>> = new Map(),
): Effect.Effect<InteropResult, never> {
	return Effect.gen(function* () {
		const key = (pkg: string, v: string) => `${pkg}@${v}`;

		// Effectful memoized fetcher: cache hit → return immediately; cache miss →
		// call resolver (degrading to {} on failure), store result, return.
		// Callers (resolveGroup, violations, deriveFloors) yield* this so lower
		// versions are fetched on-demand, not pre-fetched in bulk.
		const fetchPeer: FetchPeer = (pkg, v) => {
			const k = key(pkg, v);
			const cached = cache.get(k);
			if (cached !== undefined) return Effect.succeed(cached);
			return resolver
				.peerDependencies(pkg, v)
				.pipe(Effect.catchAll(() => Effect.succeed({} as Record<string, string>)))
				.pipe(
					Effect.map((deps) => {
						cache.set(k, deps);
						return deps;
					}),
				);
		};

		// Phase 1 (concurrent): prefetch only the ceiling version of each member.
		// This warms the cache for the most-common case (ceiling is compatible with
		// all peers) so the first violation check in resolveGroup is a fast cache
		// hit. Duplicates and prior-round cache hits are skipped.
		const seen = new Set<string>();
		const toFetch: Array<readonly [string, string]> = [];
		for (const m of members) {
			const k = key(m.pkg, m.ceiling);
			if (seen.has(k) || cache.has(k)) continue;
			seen.add(k);
			toFetch.push([m.pkg, m.ceiling] as const);
		}
		yield* Effect.forEach(toFetch, ([pkg, v]) => fetchPeer(pkg, v), { concurrency: INTEROP_PEER_CONCURRENCY });

		// Phase 2: resolve cross-peer constraints. Lower versions are fetched
		// on-demand inside violations() when a downgrade search probes them.
		const { resolved, conflicts } = yield* resolveGroup(members, fetchPeer);

		// Phase 3: derive peer floors from the final resolved set. All resolved
		// versions are already in the cache (ceilings from Phase 1, downgraded
		// versions from Phase 2's on-demand fetches).
		const peers = yield* deriveFloors(resolved, fetchPeer);

		// Expose a synchronous cache reader for reentryCandidates and the command
		// layer, which only ever read ceiling versions (always in cache after Phase 1).
		const peerDepsOf: PeerDepsOf = (pkg, v) => cache.get(key(pkg, v)) ?? {};
		return { resolved, peers, conflicts, peerDepsOf };
	});
}

/**
 * The members to re-prompt in the interactive re-entry: each downgraded or
 * conflicted dependent (capped at its resolved version) PLUS the in-group peer
 * targets those dependents depend on (uncapped, so the user can RAISE the anchor
 * instead of accepting the downgrade). `cap` is the version to cap candidates at,
 * or null for an uncapped anchor.
 *
 * @internal
 */
export function reentryCandidates(
	members: readonly GroupMember[],
	result: InteropResult,
): { readonly pkg: string; readonly cap: string | null }[] {
	const memberSet = new Set(members.map((m) => m.pkg));
	const byPkg = new Map(members.map((m) => [m.pkg, m]));
	const conflicted = new Set(result.conflicts.map((c) => c.pkg));
	const out = new Map<string, string | null>();
	// pass 1: downgraded/conflicted dependents, capped at their resolved version
	for (const m of members) {
		const r = result.resolved.get(m.pkg);
		if (r === undefined) continue;
		if (r !== m.ceiling || conflicted.has(m.pkg)) out.set(m.pkg, r);
	}
	// pass 2: each dependent's in-group peer targets, uncapped (raise affordance)
	for (const pkg of [...out.keys()]) {
		const m = byPkg.get(pkg);
		if (!m) continue;
		for (const dep of Object.keys(result.peerDepsOf(pkg, m.ceiling))) {
			if (memberSet.has(dep) && !out.has(dep)) out.set(dep, null);
		}
	}
	return [...out].map(([pkg, cap]) => ({ pkg, cap }));
}

/** True when an interop member's resolved version/peer differs from what's in source. @internal */
export function interopEntryChanged(e: CatalogEntry, result: InteropResult): boolean {
	const version = result.resolved.get(e.pkg);
	if (version === undefined) return false;
	if (`${e.operator}${version}` !== e.currentRange) return true;
	const peer = result.peers.get(e.pkg);
	if (peer === undefined) return false;
	if (e.peer) return peer !== e.peer.value;
	return true; // no peer literal yet -> will be inserted
}

/**
 * Build the span edits for one interop catalog group from its resolution: a
 * range edit when the resolved version differs, and a peer edit that rewrites an
 * existing `peer` literal or inserts `, peer: "^..."` at the range-span end.
 *
 * @internal
 */
export function buildInteropEdits(entries: readonly CatalogEntry[], result: InteropResult): Edit[] {
	const edits: Edit[] = [];
	for (const e of entries) {
		const version = result.resolved.get(e.pkg);
		if (version === undefined) continue;
		const peer = result.peers.get(e.pkg);
		const newRange = `${e.operator}${version}`;
		if (newRange !== e.currentRange) edits.push({ span: e.rangeSpan, text: JSON.stringify(newRange) });
		const at = e.rangeSpan[1];
		if (peer !== undefined) {
			if (e.peer && peer !== e.peer.value) edits.push({ span: e.peer.span, text: JSON.stringify(peer) });
			else if (!e.peer) edits.push({ span: [at, at], text: `, peer: ${JSON.stringify(peer)}` });
		}
	}
	return edits;
}

/**
 * Keep only the versions less than or equal to `max` (SemVer comparison). Used
 * to cap the candidate list of a re-prompted interop member. An unparseable
 * `max` leaves the list unchanged.
 *
 * @internal
 */
export function capVersions(list: readonly string[], max: string): Effect.Effect<string[], never> {
	return Effect.gen(function* () {
		const mv = yield* SemVer.parse(max).pipe(Effect.catchAll(() => Effect.succeed(null)));
		if (!mv) return [...list];
		const out: string[] = [];
		for (const v of list) {
			const sv = yield* SemVer.parse(v).pipe(Effect.catchAll(() => Effect.succeed(null)));
			if (sv && sv.compare(mv) <= 0) out.push(v);
		}
		return out;
	});
}
