import type { SemVer } from "@effected/semver";
import { Effect } from "effect";
import { bareVersion, parseRange, parseVersion } from "../semver-util.js";
import type { CatalogEntry, Edit } from "./types.js";

/** Maximum number of concurrent peerDependencies fetches inside runInterop. @internal */
export const INTEROP_PEER_CONCURRENCY = 8;

/**
 * Effectful, memoized peer-deps lookup used inside resolveGroup / deriveFloors /
 * violations. On a cache hit the Effect returns immediately (synchronous-speed);
 * on a miss it fetches from the resolver, stores into the shared cache, and
 * returns. Callers never double-fetch the same key.
 *
 * @internal
 */
export type FetchPeer = (pkg: string, version: string) => Effect.Effect<Record<string, string>, never>;

/**
 * Build an Effectful memoized peer-deps fetcher over `resolver`: a cache hit
 * returns immediately; a miss calls the resolver (degrading to `{}` on
 * failure), stores the result in `cache`, and returns it. A `(pkg, version)`
 * peerDeps lookup is immutable, so a shared `cache` may outlive one call.
 *
 * @internal
 */
export function makePeerFetcher(
	resolver: InteropResolver,
	cache: Map<string, Record<string, string>> = new Map(),
): FetchPeer {
	return (pkg, v) => {
		const k = `${pkg}@${v}`;
		const cached = cache.get(k);
		if (cached !== undefined) return Effect.succeed(cached);
		return resolver.peerDependencies(pkg, v).pipe(
			Effect.orElseSucceed(() => ({}) as Record<string, string>),
			Effect.map((deps) => {
				cache.set(k, deps);
				return deps;
			}),
		);
	};
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
				list.push(bareVersion(range));
				floors.set(dep, list);
			}
		}
		const out = new Map<string, string>();
		for (const [pkg, version] of resolved) {
			const lowest = lowestVersion(floors.get(pkg) ?? []);
			out.set(pkg, `^${lowest ?? version}`);
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

/** The lowest parseable version string in `list`, or null when none parses. */
function lowestVersion(list: readonly string[]): string | null {
	let best: { f: string; sv: SemVer } | null = null;
	for (const f of list) {
		const sv = parseVersion(f);
		if (sv !== null && (best === null || sv.compare(best.sv) < 0)) best = { f, sv };
	}
	return best?.f ?? null;
}

/** Does `version` satisfy `range`? Unparseable input is treated as not-satisfied. */
function satisfies(version: string, range: string): boolean {
	const r = parseRange(range);
	const v = parseVersion(version);
	return r !== null && v !== null && r.test(v);
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
			if (!satisfies(rv, range)) out.push(`${dep}@${range}`);
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
		// Each member's parseable candidates ≤ its ceiling, highest first — parsed
		// once here rather than on every iteration of the downgrade search below.
		const eligibleOf = new Map<string, string[]>();
		for (const m of members) {
			const ceiling = parseVersion(m.ceiling);
			const eligible = ceiling
				? m.candidates
						.map((v) => ({ v, sv: parseVersion(v) }))
						.filter((x): x is { v: string; sv: SemVer } => x.sv !== null && x.sv.compare(ceiling) <= 0)
						.sort((a, b) => b.sv.compare(a.sv))
						.map((x) => x.v)
				: [];
			eligibleOf.set(m.pkg, eligible);
		}

		const maxIter = members.reduce((n, m) => n + m.candidates.length, 0) + members.length + 1;
		for (let i = 0; i < maxIter; i++) {
			let changed = false;
			for (const m of members) {
				const cur = resolved.get(m.pkg) as string;
				if ((yield* violations(m.pkg, cur, resolved, memberSet, fetchPeer)).length === 0) continue;
				// search candidates ≤ ceiling, highest first, for a satisfying version
				let pick: string | null = null;
				for (const c of eligibleOf.get(m.pkg) ?? []) {
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

export interface InteropResolver {
	readonly peerDependencies: (pkg: string, version: string) => Effect.Effect<Record<string, string>, unknown>;
}
export interface InteropResult {
	readonly resolved: ReadonlyMap<string, string>;
	readonly peers: ReadonlyMap<string, string>;
	readonly conflicts: readonly InteropConflict[];
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
 * be shared across calls: each call only fetches the keys a prior one did not.
 * Omitting it yields a fresh per-call cache.
 *
 * @internal
 */
export function runInterop(
	members: readonly GroupMember[],
	resolver: InteropResolver,
	cache: Map<string, Record<string, string>> = new Map(),
): Effect.Effect<InteropResult, never> {
	return Effect.gen(function* () {
		// Callers (resolveGroup, violations, deriveFloors) yield* this so lower
		// versions are fetched on-demand, not pre-fetched in bulk.
		const fetchPeer = makePeerFetcher(resolver, cache);

		// Phase 1 (concurrent): prefetch only the ceiling version of each member.
		// This warms the cache for the most-common case (ceiling is compatible with
		// all peers) so the first violation check in resolveGroup is a fast cache
		// hit. Duplicates and prior-round cache hits are skipped.
		const seen = new Set<string>();
		const toFetch: Array<readonly [string, string]> = [];
		for (const m of members) {
			const k = `${m.pkg}@${m.ceiling}`;
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
		return { resolved, peers, conflicts };
	});
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
