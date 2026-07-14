import { Effect } from "effect";
import { Range, SemVer } from "semver-effect";
import type { PlannedEdit } from "./types.js";

/** An edit dropped because no published version satisfies its range. @internal */
export interface RejectedEdit {
	readonly pkg: string;
	readonly kind: "range" | "peer";
	readonly value: string;
	readonly reason: string;
}

/**
 * Whether at least one published version satisfies `range`.
 *
 * The predicate is deliberately "some published version satisfies this range",
 * NOT "this exact version was published": `^3.4.0` is a valid lock-minor floor
 * even when 3.4.0 itself never shipped but 3.4.1 did. Conversely `^3.0.0`
 * against a package with only `3.0.0-next.*` releases matches nothing.
 *
 * Fails OPEN — an empty version list (fetch failure, fully age-gated package)
 * or an unparseable range yields `true`. Validation is a safety net against
 * ranges we DERIVED wrongly, not a gate on the author's own hand-written
 * ranges, and rejecting everything the moment the registry is unreachable would
 * break offline peer materialization.
 *
 * @internal
 */
export function rangeIsSatisfiable(range: string, versions: readonly string[]): Effect.Effect<boolean, never> {
	return Effect.gen(function* () {
		if (versions.length === 0) return true;
		const parsedRange = yield* Range.parse(range).pipe(Effect.catchAll(() => Effect.succeed(null)));
		if (parsedRange === null) return true;
		for (const v of versions) {
			const sv = yield* SemVer.parse(v).pipe(Effect.catchAll(() => Effect.succeed(null)));
			if (sv && parsedRange.test(sv)) return true;
		}
		return false;
	});
}

/**
 * Partition planned edits into those whose range some published version
 * satisfies and those none does — ATOMICALLY per package. A catalog package
 * with a `strategy` produces a `range` edit and a `peer` edit as a pair; if
 * either is unsatisfiable, BOTH are rejected. Writing one half of the pair
 * (say, an accepted range bump next to a rejected, stale peer) would leave the
 * file internally inconsistent — the peer no longer matches what the strategy
 * derives from the new range — and every subsequent run would re-report the
 * same drift and re-reject it forever. A package is either fully updated or
 * not touched at all.
 *
 * `versionsByPkg` MUST be the UNGATED version list. Validating against the
 * release-age-gated list would spuriously reject a package whose only matching
 * version was published inside the gate window.
 *
 * @internal
 */
export function validateEdits(
	edits: readonly PlannedEdit[],
	versionsByPkg: ReadonlyMap<string, readonly string[]>,
): Effect.Effect<{ accepted: PlannedEdit[]; rejected: RejectedEdit[] }, never> {
	return Effect.gen(function* () {
		const byPkg = new Map<string, PlannedEdit[]>();
		for (const e of edits) {
			const group = byPkg.get(e.pkg) ?? [];
			group.push(e);
			byPkg.set(e.pkg, group);
		}

		const accepted: PlannedEdit[] = [];
		const rejected: RejectedEdit[] = [];
		for (const [pkg, group] of byPkg) {
			const versions = versionsByPkg.get(pkg) ?? [];
			const checked: { edit: PlannedEdit; ok: boolean }[] = [];
			for (const e of group) {
				checked.push({ edit: e, ok: yield* rangeIsSatisfiable(e.value, versions) });
			}
			const failing = checked.filter((c) => !c.ok);
			if (failing.length === 0) {
				accepted.push(...group);
				continue;
			}
			const failingKinds = failing.map((f) => f.edit.kind).join(" and ");
			for (const { edit, ok } of checked) {
				rejected.push({
					pkg,
					kind: edit.kind,
					value: edit.value,
					reason: ok
						? `dropped along with its ${failingKinds} edit for ${pkg}, which is unsatisfiable`
						: `no published version of ${pkg} satisfies ${edit.value}`,
				});
			}
		}
		return { accepted, rejected };
	});
}
