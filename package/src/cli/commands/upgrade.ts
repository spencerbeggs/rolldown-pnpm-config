import { readFileSync, writeFileSync } from "node:fs";
import { NodeServices } from "@effect/platform-node";
import { Data, Effect, Option, Result } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { discoverCatalogEntries } from "../discover.js";
import { detectPeerDrift } from "../drift.js";
import { buildEdits } from "../edits.js";
import { evaluatePluginConfig } from "../evaluate.js";
import type { FetchPeer, GroupMember, InteropConflict } from "../interop.js";
import { buildInteropEdits, interopEntryChanged, runInterop } from "../interop.js";
import type { GroupModel } from "../interop-live.js";
import { buildGroupModel, computeGroupPeers } from "../interop-live.js";
import { derivePeerRange } from "../peer-range.js";
import { planEntry } from "../plan.js";
import type { ReleaseAgeGate } from "../release-age.js";
import { combineReleaseAge, filterByReleaseAge, parsePnpmGate, readConfigReleaseAge } from "../release-age.js";
import { RegistryResolver, RegistryResolverLive } from "../resolve.js";
import { applyEdits } from "../rewrite.js";
import { filterEntriesByCatalog, findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { renderSummary } from "../summary.js";
import type { CatalogEntry, Edit, PlannedEdit } from "../types.js";
import { detectCapabilities } from "../ui/env.js";
import { runWalk } from "../ui/run-walk.js";
import type { RejectedEdit } from "../validate.js";
import { validateEdits } from "../validate.js";
import { buildWalkItems } from "../walk-plan.js";
import type { Decision, WalkItem } from "../walk-types.js";

/**
 * Typed failure raised when the upgrade run cannot complete.
 *
 * @internal
 */
export class UpgradeError extends Data.TaggedError("UpgradeError")<{ readonly message: string }> {}

interface Resolver {
	readonly versions: (pkg: string) => Effect.Effect<string[], unknown>;
	readonly times: (pkg: string) => Effect.Effect<Record<string, string>, unknown>;
	readonly pnpmConfig: (key: string) => Effect.Effect<string | null, unknown>;
	readonly peerDependencies: (pkg: string, version: string) => Effect.Effect<Record<string, string>, unknown>;
}

/** Combine the config-declared and pnpm-resolved release-age gates (strictest of both). @internal */
export function computeGate(source: string, file: string, resolver: Resolver): Effect.Effect<ReleaseAgeGate, never> {
	return Effect.gen(function* () {
		// Defensive: a thrown evaluation (malformed source/AST) degrades to a null
		// config gate rather than escaping as an Effect defect.
		const { config } = yield* Effect.try(() => evaluatePluginConfig(source, file)).pipe(
			Effect.catch(() => Effect.succeed({ config: null })),
		);
		const cfg = readConfigReleaseAge(config);
		// The two pnpmConfig reads are independent — fetch them concurrently.
		const [age, exc] = yield* Effect.all(
			[
				resolver.pnpmConfig("minimumReleaseAge").pipe(Effect.catch(() => Effect.succeed(null))),
				resolver.pnpmConfig("minimumReleaseAgeExclude").pipe(Effect.catch(() => Effect.succeed(null))),
			],
			{ concurrency: "unbounded" },
		);
		return combineReleaseAge(cfg, parsePnpmGate(age, exc));
	});
}

/** Maximum number of per-package version+times fetches to issue concurrently. @internal */
export const RESOLVE_CONCURRENCY = 12;

/**
 * Fetch and age-gate the version list for each unique package.
 *
 * @param onProgress - Optional callback invoked after each package resolves with
 *   `(resolved, total)`. Useful for emitting CLI progress feedback. Called with
 *   `(0, total)` before any work starts so callers can emit the initial banner.
 *
 * @internal
 */
export function resolveGatedVersions(
	entries: readonly CatalogEntry[],
	resolver: Resolver,
	gate: ReleaseAgeGate,
	now: number,
	onProgress?: (resolved: number, total: number) => void,
): Effect.Effect<{ gated: Map<string, string[]>; raw: Map<string, string[]>; unresolved: string[] }, never> {
	const uniquePkgs = [...new Set(entries.map((e) => e.pkg))];
	const total = uniquePkgs.length;
	// Counter is captured in the closure; only one JS thread increments it so it
	// is safe without an atomic wrapper even under concurrent fibers.
	let resolved = 0;
	onProgress?.(0, total);
	return Effect.forEach(
		uniquePkgs,
		(pkg) =>
			Effect.gen(function* () {
				const vr = yield* resolver.versions(pkg).pipe(Effect.result);
				if (Result.isFailure(vr)) {
					onProgress?.(++resolved, total);
					return [pkg, [] as string[], [] as string[]] as const;
				}
				// Fail-closed: if the publish-times fetch fails, an empty map makes
				// filterByReleaseAge drop every version (all timestamps unknown). This is a
				// safe skip, consistent with the version-fetch Left→[] path above, honoring
				// the contract of never proposing a version younger than the gate.
				// Skip times fetch entirely when no age gate is active — filterByReleaseAge
				// returns all versions unchanged when ageMinutes === 0, so the fetch is
				// wasted work.
				const times =
					gate.ageMinutes > 0
						? yield* resolver.times(pkg).pipe(Effect.catch(() => Effect.succeed({} as Record<string, string>)))
						: ({} as Record<string, string>);
				onProgress?.(++resolved, total);
				return [pkg, filterByReleaseAge(vr.success, times, gate, pkg, now), vr.success] as const;
			}),
		{ concurrency: RESOLVE_CONCURRENCY },
	).pipe(
		Effect.map((triples) => ({
			// `gated` is the only candidate source — it keeps the fail-closed semantics
			// above. `raw` is ONLY a validation input: validating a derived range against
			// the gated list would spuriously reject a package whose satisfying version
			// was published inside the gate window.
			gated: new Map(triples.map(([pkg, gated]) => [pkg, gated])),
			raw: new Map(triples.map(([pkg, , raw]) => [pkg, raw])),
			// Packages the registry could not resolve AT ALL — a misspelt name, a package
			// that does not exist, an auth failure. DISTINCT from a package whose versions
			// all fell to the release-age gate (raw non-empty, gated empty), which is a
			// legitimate "nothing old enough to offer yet", not an error.
			// Without this, a typo'd name produced an empty version list, planned to
			// keep-only, counted as up to date, and was hidden from the table entirely —
			// the author never learned the package does not exist.
			unresolved: triples.filter(([, , raw]) => raw.length === 0).map(([pkg]) => pkg),
		})),
	);
}

/**
 * Write a resolve-progress line to stderr. Overwrites the previous line with
 * ANSI carriage return so the terminal shows a single updating counter instead
 * of a flood of lines. The initial call (resolved === 0) writes a newline so
 * the first subsequent overwrite lands on its own line.
 *
 * Only call when caps.interactive is true; this function is not gated itself.
 *
 * @internal
 */
export function writeResolveProgress(resolved: number, total: number): void {
	if (resolved === 0) {
		process.stderr.write(`Resolving ${total} package${total === 1 ? "" : "s"}...\n`);
	} else if (resolved === total) {
		process.stderr.write(`\r  Resolved ${resolved}/${total}      \n`);
	} else {
		process.stderr.write(`\r  Resolved ${resolved}/${total}`);
	}
}

/**
 * Non-interactive upgrade core: read the config, discover catalog entries,
 * resolve + plan each, build edits for the latest-IN-RANGE candidate (and its
 * recomputed peer literal), and write the file. Never selects a major bump.
 *
 * A package whose version list gates to empty (fetch failure / fully age-gated)
 * is treated as a skip, except that a strategy entry can still resync or
 * materialize its managed peer offline from the current range.
 *
 * This path runs UNATTENDED (`--yes`, i.e. CI), so it fails hard rather than
 * degrading: any peer-strategy warning, or any planned edit no published
 * version satisfies, aborts the run and writes NOTHING. A warning that scrolls
 * past unread in a CI log is a bad range in a published artifact. The
 * interactive path is deliberately more forgiving (see `upgradeCommand`).
 *
 * @internal
 */
export function runUpgrade(opts: {
	file: string;
	resolver: Resolver;
	/** Optional progress callback; pass `writeResolveProgress` when caps.interactive. */
	onProgress?: (resolved: number, total: number) => void;
	/** Compute everything, report it, but skip the write. Honors `--yes --dry-run`. */
	dryRun?: boolean;
}): Effect.Effect<
	{ updated: number; skipped: string[]; conflicts: InteropConflict[]; rejected: RejectedEdit[] },
	UpgradeError
> {
	return Effect.gen(function* () {
		const source = yield* Effect.try({
			try: () => readFileSync(opts.file, "utf8"),
			catch: () => new UpgradeError({ message: `Cannot read ${opts.file}` }),
		});
		const { entries, skipped } = yield* Effect.try({
			try: () => discoverCatalogEntries(source, opts.file),
			catch: (e) => new UpgradeError({ message: String(e) }),
		});
		const gate = yield* computeGate(source, opts.file, opts.resolver);
		const versionsByPkg = yield* resolveGatedVersions(entries, opts.resolver, gate, Date.now(), opts.onProgress);

		// A package the registry cannot resolve is almost always a typo in the config.
		// Under --yes there is nobody to read a warning, and silently skipping it would
		// leave a name that will never resolve sitting in the catalog forever. Fail.
		if (versionsByPkg.unresolved.length > 0) {
			return yield* Effect.fail(new UpgradeError({ message: unresolvedMessage(versionsByPkg.unresolved) }));
		}

		const edits: PlannedEdit[] = [];
		const interopEdits: Edit[] = [];
		const warnings: string[] = [];
		const changedSpans = new Set<number>();

		for (const entry of entries) {
			if (entry.strategy === "interop") continue;
			const versions = versionsByPkg.gated.get(entry.pkg) ?? [];
			const pkg = entry.pkg;
			const rangeEdit = (span: readonly [number, number], value: string): PlannedEdit => ({
				span,
				text: JSON.stringify(value),
				pkg,
				kind: "range",
				value,
			});
			const peerEdit = (span: readonly [number, number], value: string): PlannedEdit => ({
				span,
				text: JSON.stringify(value),
				pkg,
				kind: "peer",
				value,
			});
			const peerInsert = (at: number, value: string): PlannedEdit => ({
				span: [at, at],
				text: `, peer: ${JSON.stringify(value)}`,
				pkg,
				kind: "peer",
				value,
			});

			// Derive the entry's peer ONCE, up front, so the incompatibility warning is
			// collected wherever the entry lands below — range bump, offline resync, or
			// materialize — not only on the peer-only paths. A derivation FAILURE stays a
			// silent skip (the entry simply gets no peer edit); only a WARNING is fatal.
			const derived = entry.strategy
				? yield* derivePeerRange(entry.currentRange, entry.strategy).pipe(Effect.catch(() => Effect.succeed(null)))
				: null;
			if (derived?.warning) warnings.push(`${entry.pkg}: ${derived.warning.message}`);

			if (versions.length === 0) {
				// No fetchable versions, but a strategy entry can still resync a drifted
				// peer or materialize a missing one offline from the current range
				// (parity with the interactive walk); otherwise the entry is a skip.
				const at = entry.rangeSpan[1];
				if (entry.peer && entry.strategy) {
					const expected = yield* detectPeerDrift(entry).pipe(Effect.catch(() => Effect.succeed(null)));
					if (expected !== null) {
						edits.push(peerEdit(entry.peer.span, expected));
						changedSpans.add(entry.rangeSpan[0]);
						continue;
					}
				} else if (!entry.peer && entry.strategy && derived !== null) {
					edits.push(peerInsert(at, derived.range));
					changedSpans.add(entry.rangeSpan[0]);
					continue;
				}
				skipped.push(`${entry.catalog}.${entry.pkg}`);
				continue;
			}
			const candidates = yield* planEntry(entry, versions).pipe(Effect.catch(() => Effect.succeed([])));
			const inRange = candidates.find((c) => c.kind === "in-range");
			const at = entry.rangeSpan[1];
			if (inRange) {
				edits.push(rangeEdit(entry.rangeSpan, inRange.range));
				changedSpans.add(entry.rangeSpan[0]);
				if (entry.peer && inRange.peerRange) {
					edits.push(peerEdit(entry.peer.span, inRange.peerRange));
				} else if (!entry.peer && entry.strategy && inRange.peerRange) {
					edits.push(peerInsert(at, inRange.peerRange));
				}
			} else if (!entry.peer && entry.strategy && derived !== null) {
				// Already at newest, but the strategy declares a managed peer that does not exist yet:
				// materialize it from the current range.
				edits.push(peerInsert(at, derived.range));
				changedSpans.add(entry.rangeSpan[0]);
			} else if (entry.peer && entry.strategy) {
				// Already at newest, but an existing peer literal may have drifted from
				// the strategy: resync it (parity with the interactive walk).
				const expected = yield* detectPeerDrift(entry).pipe(Effect.catch(() => Effect.succeed(null)));
				if (expected !== null) {
					edits.push(peerEdit(entry.peer.span, expected));
					changedSpans.add(entry.rangeSpan[0]);
				}
			}
		}

		// group interop entries by catalog and reconcile each group
		const interopEntries = entries.filter((e) => e.strategy === "interop");
		const conflicts: InteropConflict[] = [];
		const byCatalog = new Map<string, CatalogEntry[]>();
		for (const e of interopEntries) {
			const list = byCatalog.get(e.catalog) ?? [];
			list.push(e);
			byCatalog.set(e.catalog, list);
		}
		for (const [, group] of byCatalog) {
			const members: GroupMember[] = [];
			for (const e of group) {
				const versions = versionsByPkg.gated.get(e.pkg) ?? [];
				const cands = yield* planEntry(e, versions).pipe(Effect.catch(() => Effect.succeed([])));
				const inRange = cands.find((c) => c.kind === "in-range");
				const ceiling = inRange ? inRange.version : e.currentRange.replace(/^[\^~]/, "");
				members.push({ pkg: e.pkg, ceiling, candidates: versions });
			}
			const result = yield* runInterop(members, opts.resolver);
			interopEdits.push(...buildInteropEdits(group, result));
			for (const e of group) if (interopEntryChanged(e, result)) changedSpans.add(e.rangeSpan[0]);
			conflicts.push(...result.conflicts);
		}

		if (warnings.length > 0) {
			return yield* Effect.fail(
				new UpgradeError({
					message: `Refusing to apply with an incompatible peer strategy:\n${warnings.map((w) => `  ${w}`).join("\n")}`,
				}),
			);
		}

		// Validate against the UNGATED list: the release-age gate hides recently
		// published versions, and an entry whose only satisfying version is inside the
		// gate window is still perfectly satisfiable.
		const { accepted, rejected } = yield* validateEdits(edits, versionsByPkg.raw);
		if (rejected.length > 0) {
			return yield* Effect.fail(
				new UpgradeError({
					message: `Refusing to write unsatisfiable range(s):\n${rejected.map((r) => `  ${r.reason}`).join("\n")}`,
				}),
			);
		}

		// Interop peers are derived group-wise from versions runInterop just resolved,
		// so they are satisfiable by construction and skip validation.
		const allEdits: Edit[] = [...accepted, ...interopEdits];
		// `--dry-run` composes with `--yes`: everything above ran for real (resolve,
		// plan, interop reconcile, validation, the hard failures), so the reported
		// counts are exactly what an apply would have written. Only the write is
		// skipped. Ignoring dryRun here would make `--yes --dry-run` WRITE — the
		// precise opposite of what someone adding the flag in CI is asking for.
		if (allEdits.length > 0 && !opts.dryRun) {
			const next = applyEdits(source, allEdits);
			yield* Effect.try({
				try: () => writeFileSync(opts.file, next, "utf8"),
				catch: () => new UpgradeError({ message: `Cannot write ${opts.file}` }),
			});
		}

		const updated = changedSpans.size;
		return { updated, skipped, conflicts, rejected };
	});
}

/** Count the decisions that actually change the file (a bump, a peer resync, or a materialize). @internal */
export function countChangedDecisions(decisions: readonly Decision[]): number {
	return decisions.filter(
		(d) =>
			d.chosen.kind !== "keep" ||
			(d.item.entry.peer !== undefined && d.item.driftPeer !== null) ||
			(d.item.entry.peer === undefined && d.item.materializePeer !== null),
	).length;
}

/**
 * Apply the interactive result: the (already validated) non-interop edits plus
 * the interop members' separately-computed span edits. Interop members are
 * EXCLUDED from `buildEdits` upstream so the two never emit a range edit over
 * the same span (which `applyEdits` would reject as overlapping).
 *
 * Edits arrive pre-validated so the caller can report what was dropped rather
 * than failing the whole run.
 *
 * @internal
 */
export function applyInteropAndDecisions(
	file: string,
	source: string,
	nonInteropEdits: readonly Edit[],
	interopEdits: readonly Edit[],
): Effect.Effect<void, UpgradeError> {
	return Effect.gen(function* () {
		const edits = [...nonInteropEdits, ...interopEdits];
		if (edits.length === 0) return;
		const next = applyEdits(source, edits);
		yield* Effect.try({
			try: () => writeFileSync(file, next, "utf8"),
			catch: () => new UpgradeError({ message: `Cannot write ${file}` }),
		});
	});
}

/**
 * The message printed instead of entering the interactive table when nothing
 * is actionable: either no catalog packages were discovered at all, or every
 * discovered package is already up to date.
 *
 * @internal
 */
export function nothingToUpgradeMessage(totalItems: number): string {
	return totalItems === 0
		? "Nothing to upgrade — no catalog packages found.\n"
		: `Nothing to upgrade — ${totalItems} package(s) already up to date.\n`;
}

/**
 * The message for packages the registry could not resolve. Almost always a
 * misspelt name in the config; occasionally a private package the current
 * .npmrc cannot authenticate against.
 *
 * @internal
 */
export function unresolvedMessage(unresolved: readonly string[]): string {
	const list = unresolved.map((p) => `  ${p}`).join("\n");
	return `Could not resolve ${unresolved.length} package(s) from the registry — check the name(s) for typos, or your registry auth:\n${list}`;
}

/** Project walk items to the non-interactive default decisions (latest-in-range, plus peer-only keeps). @internal */
export function projectDecisions(items: readonly WalkItem[], full: boolean): Decision[] {
	const out: Decision[] = [];
	for (const i of items) {
		const inRange = i.candidates.find((c) => c.kind === "in-range");
		if (inRange) {
			out.push({ item: i, chosen: inRange });
			continue;
		}
		if (i.driftPeer !== null || i.materializePeer !== null) {
			const keep = i.candidates.find((c) => c.kind === "keep");
			if (keep) {
				out.push({ item: i, chosen: keep });
				continue;
			}
		}
		if (full) {
			const keep = i.candidates.find((c) => c.kind === "keep");
			if (keep) out.push({ item: i, chosen: keep });
		}
	}
	return out;
}

/** Build the colored preview summary string without writing. @internal */
export function runUpgradePreview(opts: {
	file: string;
	resolver: Resolver;
	full: boolean;
	color?: boolean;
}): Effect.Effect<string, UpgradeError> {
	return Effect.gen(function* () {
		const source = yield* Effect.try({
			try: () => readFileSync(opts.file, "utf8"),
			catch: () => new UpgradeError({ message: `Cannot read ${opts.file}` }),
		});
		const discovered = yield* Effect.try({
			try: () => discoverCatalogEntries(source, opts.file),
			catch: (e) => new UpgradeError({ message: String(e) }),
		});
		const gate = yield* computeGate(source, opts.file, opts.resolver);
		const versions = yield* resolveGatedVersions(discovered.entries, opts.resolver, gate, Date.now());
		const items = yield* buildWalkItems(discovered.entries, versions.gated).pipe(
			Effect.catch((e) => Effect.fail(new UpgradeError({ message: e.message }))),
		);
		const text = renderSummary(projectDecisions(items, opts.full), undefined, { color: opts.color ?? false });
		// --preview must not hide a typo either: an unresolvable package renders as
		// up-to-date and would otherwise be invisible in the projection.
		return versions.unresolved.length > 0 ? `${text}\n⚠ ${unresolvedMessage(versions.unresolved)}` : text;
	});
}

/**
 * Resolve the target file: the passed path, or autodetect in cwd.
 *
 * @internal
 */
export function resolveTargetFile(fileOpt: Option.Option<string>): Effect.Effect<string, UpgradeError> {
	return Effect.gen(function* () {
		const explicit = Option.getOrUndefined(fileOpt);
		if (explicit !== undefined) return explicit;
		const matches = yield* findConfigFiles(process.cwd());
		const picked = pickConfigCandidate(matches);
		if (!picked.ok) return yield* Effect.fail(new UpgradeError({ message: picked.message }));
		return picked.file;
	});
}

const fileArg = Argument.file("file", { mustExist: true }).pipe(Argument.optional);
const yesFlag = Flag.boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false));
const dryRunFlag = Flag.boolean("dry-run").pipe(Flag.withDefault(false));
const catalogOption = Flag.string("catalog").pipe(Flag.optional);
const previewFlag = Flag.boolean("preview").pipe(Flag.withDefault(false));
const fullFlag = Flag.boolean("full").pipe(Flag.withDefault(false));

/**
 * The "upgrade" command. The default path runs the interactive table;
 * --yes applies latest-in-range non-interactively; --dry-run runs the identical
 * interactive flow and reports what it would have written, but writes nothing;
 * --catalog restricts to a single catalog by name.
 *
 * @internal
 */
export const upgradeCommand = Command.make(
	"upgrade",
	{ file: fileArg, yes: yesFlag, dryRun: dryRunFlag, catalog: catalogOption, preview: previewFlag, full: fullFlag },
	({ file: fileOpt, yes, dryRun, catalog, preview, full }) =>
		Effect.gen(function* () {
			const file = yield* resolveTargetFile(fileOpt);
			const resolver = yield* RegistryResolver;
			const caps = detectCapabilities();
			if (preview) {
				const text = yield* runUpgradePreview({ file, resolver, full, color: caps.color });
				yield* Effect.sync(() => process.stdout.write(`${text}\n`));
				return;
			}
			if (yes) {
				const result = yield* runUpgrade({
					file,
					resolver,
					dryRun,
					...(caps.interactive ? { onProgress: writeResolveProgress } : {}),
				});
				yield* Effect.sync(() =>
					process.stdout.write(
						dryRun
							? `Dry run — no changes written. ${result.updated} package(s) would be updated; skipped ${result.skipped.length}.\n`
							: `Updated ${result.updated} package(s); skipped ${result.skipped.length}.\n`,
					),
				);
				if (result.conflicts.length > 0) {
					const lines = result.conflicts
						.map((c) => `  ${c.pkg} (kept ${c.ceiling}) blocked by ${c.blockedBy}`)
						.join("\n");
					yield* Effect.sync(() => process.stdout.write(`Interop conflicts (left at your pick):\n${lines}\n`));
				}
				return;
			}
			const source = yield* Effect.try({
				try: () => readFileSync(file, "utf8"),
				catch: () => new UpgradeError({ message: `Cannot read ${file}` }),
			});
			const discovered = yield* Effect.try({
				try: () => discoverCatalogEntries(source, file),
				catch: (e) => new UpgradeError({ message: String(e) }),
			});
			const catalogName = Option.getOrUndefined(catalog);
			const entries = filterEntriesByCatalog(discovered.entries, catalogName);
			const gate = yield* computeGate(source, file, resolver);
			const versions = yield* resolveGatedVersions(
				entries,
				resolver,
				gate,
				Date.now(),
				caps.interactive ? writeResolveProgress : undefined,
			);
			const items = yield* buildWalkItems(entries, versions.gated).pipe(
				Effect.catch((e) => Effect.fail(new UpgradeError({ message: e.message }))),
			);
			// --dry-run is NOT a separate code path: it runs the identical interactive
			// flow (table → picks → interop reconcile → validate → summary) and skips
			// only the final write. Short-circuiting here instead would show a table of
			// auto-picked defaults the user never got to choose, and would silently skip
			// the interop reconcile — so the "preview" would not match what an apply does.
			if (!caps.interactive) {
				const text = renderSummary(projectDecisions(items, full), undefined, { color: caps.color });
				const note = dryRun
					? "(dry run — nothing written)"
					: "(non-interactive terminal — run with --yes to apply, or in a TTY to choose)";
				const warn = versions.unresolved.length > 0 ? `\n⚠ ${unresolvedMessage(versions.unresolved)}\n` : "";
				yield* Effect.sync(() => process.stdout.write(`${text}${warn}\n\n${note}\n`));
				return;
			}
			// Show every discovered row — up-to-date rows included, as non-selectable
			// context — so a fully up-to-date catalog is never hidden from the table.
			// The cursor starts on the first actionable row (see initTable). Only bail
			// when nothing at all was discovered.
			if (items.length === 0) {
				// An unresolvable package plans to keep-only and so counts as "up to date".
				// Reporting only "nothing to upgrade" here would hide the typo completely —
				// the exact silent-omission this warning exists to prevent.
				const warn = versions.unresolved.length > 0 ? `⚠ ${unresolvedMessage(versions.unresolved)}\n\n` : "";
				yield* Effect.sync(() => process.stdout.write(`${warn}${nothingToUpgradeMessage(0)}`));
				return;
			}
			// Pre-fetch peerDependencies for every interop candidate version so the live
			// table can recompute peer floors + conflicts as picks change — the same
			// data runInterop fetches, moved ahead of the walk. Interactively the live
			// table IS the reconcile; --yes/CI keeps the auto-reconcile (runUpgrade).
			const interopByCatalog = new Map<string, CatalogEntry[]>();
			for (const e of entries) {
				if (e.strategy !== "interop") continue;
				const list = interopByCatalog.get(e.catalog) ?? [];
				list.push(e);
				interopByCatalog.set(e.catalog, list);
			}
			const peerCache = new Map<string, Record<string, string>>();
			const fetchPeer: FetchPeer = (pkg, v) => {
				const k = `${pkg}@${v}`;
				const cached = peerCache.get(k);
				if (cached !== undefined) return Effect.succeed(cached);
				return resolver.peerDependencies(pkg, v).pipe(
					Effect.catch(() => Effect.succeed({} as Record<string, string>)),
					Effect.map((deps) => {
						peerCache.set(k, deps);
						return deps;
					}),
				);
			};
			if (interopByCatalog.size > 0) {
				yield* Effect.sync(() => process.stderr.write("Resolving peer dependencies…\n"));
			}
			const interopModels = new Map<string, GroupModel>();
			for (const [catalog, group] of interopByCatalog) {
				const candByPkg = new Map<string, string[]>();
				for (const e of group) {
					const it = items.find((i) => i.entry.catalog === catalog && i.entry.pkg === e.pkg);
					candByPkg.set(e.pkg, it ? it.candidates.map((c) => c.version) : [e.currentRange.replace(/^[\^~]/, "")]);
				}
				interopModels.set(catalog, yield* buildGroupModel(candByPkg, fetchPeer));
			}

			const decisions = yield* runWalk(items, dryRun, versions.unresolved, interopModels);

			// Interop write path: honor the user's final picks + the live-derived peer
			// floors directly — no auto-downgrade, no re-prompt. The live table already
			// surfaced any conflict; whatever the user left is written as picked and
			// reported. Interop edits are built separately and EXCLUDED from buildEdits
			// so the two never emit a range edit over the same span.
			const nonInteropDecisions = decisions.filter((d) => d.item.entry.strategy !== "interop");
			const interopEdits: Edit[] = [];
			const allConflicts: InteropConflict[] = [];
			let interopChanged = 0;
			for (const [catalog, group] of interopByCatalog) {
				const model = interopModels.get(catalog);
				if (model === undefined) continue;
				const selected = new Map<string, string>();
				for (const e of group) {
					const d = decisions.find((dd) => dd.item.entry.catalog === catalog && dd.item.entry.pkg === e.pkg);
					selected.set(e.pkg, d ? d.chosen.version : e.currentRange.replace(/^[\^~]/, ""));
				}
				const { peer, conflict } = computeGroupPeers(model, selected);
				interopEdits.push(
					...buildInteropEdits(group, { resolved: selected, peers: peer, conflicts: [], peerDepsOf: () => ({}) }),
				);
				for (const [pkg, blockedBy] of conflict) {
					allConflicts.push({ pkg, ceiling: selected.get(pkg) ?? "", blockedBy });
				}
				for (const e of group) {
					const version = selected.get(e.pkg);
					if (version === undefined) continue;
					const rangeChanged = `${e.operator}${version}` !== e.currentRange;
					const newPeer = peer.get(e.pkg);
					const peerChanged = newPeer !== undefined && (e.peer ? newPeer !== e.peer.value : true);
					if (rangeChanged || peerChanged) interopChanged++;
				}
			}

			// Validate the planned edits against the UNGATED version list. Interactively a
			// rejection is DROPPED and REPORTED — one bad package must not block an
			// otherwise-good upgrade, and the user can see the warning and go fix their
			// config. (`--yes` fails hard instead; see runUpgrade.)
			const planned = buildEdits(nonInteropDecisions);
			const { accepted, rejected } = yield* validateEdits(planned, versions.raw);
			const acceptedPkgs = new Set(accepted.map((e) => e.pkg));

			yield* Effect.sync(() =>
				process.stdout.write(
					`${renderSummary(decisions, { adjustments: [], conflicts: allConflicts }, { color: caps.color }, rejected)}\n`,
				),
			);
			// The ONLY thing --dry-run skips. Everything above ran for real, so the
			// summary reports exactly what an apply would have written.
			if (!dryRun) {
				yield* applyInteropAndDecisions(file, source, accepted, interopEdits);
			}
			// A decision whose every edit was rejected wrote nothing, so it is not counted.
			const nonInteropChanged = countChangedDecisions(
				nonInteropDecisions.filter((d) => acceptedPkgs.has(d.item.entry.pkg)),
			);
			const changed = nonInteropChanged + interopChanged;
			yield* Effect.sync(() =>
				process.stdout.write(
					dryRun
						? `Dry run — no changes written. ${changed} change(s) would be applied.\n`
						: `Applied ${changed} change(s).\n`,
				),
			);
			// Repeat the unresolved warning after the run: the in-table banner scrolls out
			// of view once Ink tears down, and this is the last thing the author reads.
			if (versions.unresolved.length > 0) {
				yield* Effect.sync(() => process.stdout.write(`\n⚠ ${unresolvedMessage(versions.unresolved)}\n`));
			}
		}).pipe(Effect.provide(RegistryResolverLive), Effect.provide(NodeServices.layer)),
).pipe(Command.withDescription("Upgrade catalog versions in a config file"));
