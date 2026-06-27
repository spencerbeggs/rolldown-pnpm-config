import { Effect } from "effect";
import { Range, SemVer } from "semver-effect";

/** Synchronous lookup of already-fetched peerDependencies for a (pkg, version). @internal */
export type PeerDepsOf = (pkg: string, version: string) => Record<string, string>;

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
	peerDepsOf: PeerDepsOf,
): Effect.Effect<Map<string, string>, never> {
	return Effect.gen(function* () {
		const floors = new Map<string, string[]>();
		for (const [pkg, version] of resolved) {
			const peers = peerDepsOf(pkg, version);
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

/** In-group peers of (pkg@version) that the current resolution violates, as "dep@range" strings. */
function violations(
	pkg: string,
	version: string,
	resolved: ReadonlyMap<string, string>,
	memberSet: ReadonlySet<string>,
	peerDepsOf: PeerDepsOf,
): Effect.Effect<string[], never> {
	return Effect.gen(function* () {
		const out: string[] = [];
		for (const [dep, range] of Object.entries(peerDepsOf(pkg, version))) {
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
	peerDepsOf: PeerDepsOf,
): Effect.Effect<GroupResolution, never> {
	return Effect.gen(function* () {
		const memberSet = new Set(members.map((m) => m.pkg));
		const resolved = new Map<string, string>(members.map((m) => [m.pkg, m.ceiling]));
		const ceilingOf = new Map(members.map((m) => [m.pkg, m.ceiling]));
		const byPkg = new Map(members.map((m) => [m.pkg, m]));

		const leq = (a: string, b: string): Effect.Effect<boolean, never> =>
			Effect.gen(function* () {
				const av = yield* SemVer.parse(a).pipe(Effect.catchAll(() => Effect.succeed(null)));
				const bv = yield* SemVer.parse(b).pipe(Effect.catchAll(() => Effect.succeed(null)));
				return av && bv ? av.compare(bv) <= 0 : false;
			});

		const maxIter = members.length + 1;
		for (let i = 0; i < maxIter; i++) {
			let changed = false;
			for (const m of members) {
				const cur = resolved.get(m.pkg) as string;
				if ((yield* violations(m.pkg, cur, resolved, memberSet, peerDepsOf)).length === 0) continue;
				// search candidates ≤ ceiling, highest first, for a satisfying version
				const ceiling = ceilingOf.get(m.pkg) as string;
				const eligible: string[] = [];
				for (const c of m.candidates) if (yield* leq(c, ceiling)) eligible.push(c);
				const sorted = yield* sortDesc(eligible);
				let pick: string | null = null;
				for (const c of sorted) {
					if ((yield* violations(m.pkg, c, resolved, memberSet, peerDepsOf)).length === 0) {
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
			const v = yield* violations(m.pkg, cur, resolved, memberSet, peerDepsOf);
			if (v.length > 0) {
				conflicts.push({ pkg: m.pkg, ceiling: (byPkg.get(m.pkg) as GroupMember).ceiling, blockedBy: v.join(", ") });
			}
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
