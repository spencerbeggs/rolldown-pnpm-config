import { Effect } from "effect";
import { SemVer } from "semver-effect";

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
			if (declared && declared.length) {
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
