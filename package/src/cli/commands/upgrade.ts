import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Document } from "@effected/cli";
import { CliDoc, CliExit, CliInteractive, CliMessage, Doc } from "@effected/cli";
import { CliUi } from "@effected/cli/ui";
import type { PartialReleaseAgeGate } from "@effected/npm";
import { ReleaseAgeGate } from "@effected/npm";
import { Console, Data, Effect, Option, Result, Runtime } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import type { VersionSource } from "../../catalogs.js";
import { bareVersion } from "../../semver-util.js";
import { WorkingDirectory } from "../cwd.js";
import { discoverCatalogEntries } from "../discover.js";
import { buildEdits, entryEdits } from "../edits.js";
import { evaluatePluginConfig } from "../evaluate.js";
import type { GroupMember, InteropConflict } from "../interop.js";
import { buildInteropEdits, interopEntryChanged, makePeerFetcher, runInterop } from "../interop.js";
import type { GroupModel } from "../interop-live.js";
import { buildGroupModel, computeGroupPeers } from "../interop-live.js";
import { derivePeerRange } from "../peer-range.js";
import { defaultPick, planEntry } from "../plan.js";
import { parsePnpmGate, readConfigReleaseAge } from "../release-age.js";
import { printDoc } from "../render/print.js";
import { failureDoc, warningDoc } from "../render/report.js";
import { RegistryResolver, RegistryResolverLive } from "../resolve.js";
import { applyEdits } from "../rewrite.js";
import { filterEntriesByCatalog, findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { summaryDoc } from "../summary.js";
import type { CatalogEntry, Edit, PlannedEdit } from "../types.js";
import type { ProgressEvent } from "../ui/progress.js";
import { walkScreen, withProgress } from "../ui/screens.js";
import type { RejectedEdit } from "../validate.js";
import { validateEdits } from "../validate.js";
import { versionKeyOf } from "../version-key.js";
import { buildWalkItems } from "../walk-plan.js";
import type { Decision, WalkItem } from "../walk-types.js";
import { findWorkspaceRoot, makeWorkspaceResolver } from "../workspace-resolve.js";

/**
 * Typed failure raised when the upgrade run cannot complete.
 *
 * @internal
 */
export class UpgradeError extends Data.TaggedError("UpgradeError")<{
	readonly message: string;
	/**
	 * Failure family for machine consumers: `"peer-strategy"` for a refusal to
	 * apply with an incompatible peer strategy, absent (→ `"resolution"` in the
	 * JSON documents) for everything else.
	 */
	readonly kind?: "peer-strategy";
}> {
	/** The failure report `CliRuntime.main` prints: the message, without the class name. */
	[CliDoc](): Document {
		return failureDoc(this.message);
	}
}

/**
 * An invalid flag combination: a usage error, so it exits 64 (BSD
 * `EX_USAGE`) rather than the 1 a resolution failure exits with.
 *
 * @internal
 */
export class UpgradeUsageError extends Data.TaggedError("UpgradeUsageError")<{ readonly message: string }> {
	override readonly [Runtime.errorExitCode] = 64;
	/** The failure report `CliRuntime.main` prints: the message, without the class name. */
	[CliDoc](): Document {
		return failureDoc(this.message);
	}
}

/** The heading of `--check`'s resolution-failure report. @internal */
export const CHECK_FAILED_LABEL = "Catalog check failed before drift could be evaluated (resolution error, not drift):";

function indent(message: string): string {
	return message
		.split("\n")
		.map((l) => `  ${l}`)
		.join("\n");
}

/**
 * `--check`'s resolution failure: the run could not get far enough to say
 * whether the catalogs drifted. It shares `--check`'s non-zero exit with
 * drift, so its report names the failure family — a gate consuming the exit
 * code reports every non-zero as "drifted", and without the label the CI log
 * would blame drift for a typo'd package or an auth failure.
 *
 * @internal
 */
export class CheckFailedError extends Data.TaggedError("CheckFailedError")<{
	readonly message: string;
	readonly kind?: "peer-strategy";
}> {
	/** The failure report: the family label, then the underlying message indented. */
	[CliDoc](): Document {
		return failureDoc(`${CHECK_FAILED_LABEL}\n${indent(this.message)}`);
	}
}

/**
 * One changed entry in a non-interactive run: its `catalog.pkg` name, the
 * range it moves from (and to, when the change is a range bump rather than a
 * peer-only resync), and which version source it resolved from — so `--check`'s
 * drift list can say which rows track the workspace and which the registry,
 * and `--json` can emit a self-describing from→to row.
 *
 * @internal
 */
export interface CheckDriftRow {
	readonly name: string;
	readonly catalog: string;
	readonly pkg: string;
	readonly from: string;
	/** The new range, absent for a peer-only resync/materialize (the range itself is unchanged). */
	readonly to?: string;
	readonly source: VersionSource;
}

/**
 * What a non-interactive `runUpgrade` reports back to its caller.
 *
 * @internal
 */
export interface UpgradeRunResult {
	readonly updated: number;
	readonly skipped: string[];
	readonly conflicts: InteropConflict[];
	readonly rejected: RejectedEdit[];
	readonly changed: CheckDriftRow[];
}

interface Resolver {
	readonly versions: (pkg: string) => Effect.Effect<string[], unknown>;
	readonly times: (pkg: string) => Effect.Effect<Record<string, string>, unknown>;
	readonly pnpmConfig: (key: string) => Effect.Effect<string | null, unknown>;
	readonly peerDependencies: (pkg: string, version: string) => Effect.Effect<Record<string, string>, unknown>;
}

/** Read a config file and statically discover its catalog entries. @internal */
export function readCatalogSource(
	file: string,
): Effect.Effect<{ source: string; entries: CatalogEntry[]; skipped: string[] }, UpgradeError> {
	return Effect.gen(function* () {
		const source = yield* Effect.try({
			try: () => readFileSync(file, "utf8"),
			catch: () => new UpgradeError({ message: `Cannot read ${file}` }),
		});
		const { entries, skipped } = yield* Effect.try({
			try: () => discoverCatalogEntries(source, file),
			catch: (e) => new UpgradeError({ message: String(e) }),
		});
		return { source, entries, skipped };
	});
}

/** Combine the config-declared and pnpm-resolved release-age gates (strictest of both). @internal */
export function computeGate(source: string, file: string, resolver: Resolver): Effect.Effect<ReleaseAgeGate, never> {
	return Effect.gen(function* () {
		// Defensive: a thrown evaluation (malformed source/AST) degrades to a null
		// config gate rather than escaping as an Effect defect.
		const { config } = yield* Effect.try(() => evaluatePluginConfig(source, file)).pipe(
			Effect.orElseSucceed(() => ({ config: null })),
		);
		const cfg = readConfigReleaseAge(config);
		// The two pnpmConfig reads are independent — fetch them concurrently.
		const [age, exc] = yield* Effect.all(
			[
				resolver.pnpmConfig("minimumReleaseAge").pipe(Effect.orElseSucceed(() => null)),
				resolver.pnpmConfig("minimumReleaseAgeExclude").pipe(Effect.orElseSucceed(() => null)),
			],
			{ concurrency: "unbounded" },
		);
		const contributions = [cfg, parsePnpmGate(age, exc)].filter((g): g is PartialReleaseAgeGate => g !== null);
		return ReleaseAgeGate.combine(...contributions);
	});
}

/** Maximum number of per-package version+times fetches to issue concurrently. @internal */
export const RESOLVE_CONCURRENCY = 12;

/**
 * Fetch and age-gate the version list for each unique (pkg × route) pair.
 * The returned maps are keyed by `versionKeyOf(entry)`, NOT the bare package
 * name: the same name can appear workspace-sourced in one catalog and
 * registry-sourced in another, and the two routes must neither share a version
 * list nor a gate exemption.
 *
 * @param onProgress - Optional reporter run after each package resolves with
 *   `(resolved, total)`, for CLI progress feedback. Run with `(0, total)`
 *   before any work starts so callers can begin the phase.
 * @param workspace - Optional workspace-backed resolver. An entry whose
 *   `source` is `"workspace"` resolves through it instead of the registry, and
 *   is EXEMPT from the release-age gate: its next version is unpublished, so
 *   `times` is empty and the gate would otherwise hold it forever.
 *
 * @internal
 */
export function resolveGatedVersions(
	entries: readonly CatalogEntry[],
	resolver: Resolver,
	gate: ReleaseAgeGate,
	now: number,
	onProgress?: (resolved: number, total: number) => Effect.Effect<void>,
	workspace?: Resolver,
): Effect.Effect<{ gated: Map<string, string[]>; raw: Map<string, string[]>; unresolved: string[] }, never> {
	// One resolution per unique (pkg × route) pair. The route is workspace only
	// when the caller supplied a workspace resolver AND the entry declares
	// `source: "workspace"` — an entry keyed to the workspace route without a
	// workspace resolver still resolves (and gates) through the registry.
	const pairs = new Map<string, { pkg: string; fromWorkspace: boolean }>();
	for (const e of entries) {
		pairs.set(versionKeyOf(e), { pkg: e.pkg, fromWorkspace: workspace !== undefined && e.source === "workspace" });
	}
	const total = pairs.size;
	// Counter is captured in the closure; only one JS thread increments it so it
	// is safe without an atomic wrapper even under concurrent fibers.
	let resolved = 0;
	const report = onProgress ?? (() => Effect.void);
	return Effect.andThen(report(0, total), () =>
		Effect.forEach(
			[...pairs],
			([key, { pkg, fromWorkspace }]) =>
				Effect.gen(function* () {
					const routed = fromWorkspace && workspace !== undefined ? workspace : resolver;
					// A workspace-sourced next version is unpublished: it has no publish
					// timestamp, so the age gate would drop it as un-timestamped. The workspace
					// route is EXEMPT from the gate, not blocked by it — the version came
					// from this repo's own manifests and pending changesets, not the registry.
					// Fail-closed on the registry route: if the publish-times fetch fails, an
					// empty map makes gate.filterVersions drop every version (all timestamps
					// unknown) — a safe skip honoring the contract of never proposing a version
					// younger than the gate. The times fetch is skipped entirely when no age
					// gate is active (filterVersions is the identity at ageMinutes === 0), and
					// otherwise runs concurrently with the versions fetch — both are
					// independent `pnpm view` spawns of the same packument.
					const needTimes = !fromWorkspace && gate.ageMinutes > 0;
					const [vr, times] = yield* Effect.all(
						[
							routed.versions(pkg).pipe(Effect.result),
							needTimes
								? resolver.times(pkg).pipe(Effect.orElseSucceed(() => ({}) as Record<string, string>))
								: Effect.succeed({} as Record<string, string>),
						],
						{ concurrency: "unbounded" },
					);
					yield* report(++resolved, total);
					if (Result.isFailure(vr)) return [key, pkg, [] as string[], [] as string[]] as const;
					if (fromWorkspace) return [key, pkg, vr.success, vr.success] as const;
					const gated: string[] = [...gate.filterVersions(vr.success, times, pkg, now)];
					return [key, pkg, gated, vr.success] as const;
				}),
			{ concurrency: RESOLVE_CONCURRENCY },
		).pipe(
			Effect.map((rows) => ({
				// `gated` is the only candidate source — it keeps the fail-closed semantics
				// above. `raw` is ONLY a validation input: validating a derived range against
				// the gated list would spuriously reject a package whose satisfying version
				// was published inside the gate window.
				gated: new Map(rows.map(([key, , gated]) => [key, gated])),
				raw: new Map(rows.map(([key, , , raw]) => [key, raw])),
				// Packages the registry could not resolve AT ALL — a misspelt name, a package
				// that does not exist, an auth failure. DISTINCT from a package whose versions
				// all fell to the release-age gate (raw non-empty, gated empty), which is a
				// legitimate "nothing old enough to offer yet", not an error.
				// Without this, a typo'd name produced an empty version list, planned to
				// keep-only, counted as up to date, and was hidden from the table entirely —
				// the author never learned the package does not exist.
				// Name-based and deduped: a name failing on either route is reported once.
				unresolved: [...new Set(rows.filter(([, , , raw]) => raw.length === 0).map(([, pkg]) => pkg))],
			})),
		),
	);
}

/**
 * Adapt a progress-event reporter to `resolveGatedVersions`' `(resolved,
 * total)` callback: the first call begins the resolve phase, each later one
 * steps it, and the last finishes it, so the live view commits a
 * "Resolved N packages" line as soon as resolution is done.
 *
 * @internal
 */
export function resolveProgress(
	report: (event: ProgressEvent) => Effect.Effect<void>,
): (resolved: number, total: number) => Effect.Effect<void> {
	const noun = (n: number) => `${n} package${n === 1 ? "" : "s"}`;
	const finished = (total: number) => report({ _tag: "Finished", label: `Resolved ${noun(total)}` });
	return (resolved, total) => {
		if (resolved === 0) {
			const begin = report({ _tag: "Phase", label: `Resolving ${noun(total)}`, total });
			return total === 0 ? Effect.andThen(begin, finished(total)) : begin;
		}
		const step = report({ _tag: "Step", done: resolved });
		return resolved === total ? Effect.andThen(step, finished(total)) : step;
	};
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
	/** Optional progress reporter (see `resolveProgress`); only an interactive run draws it. */
	onProgress?: (resolved: number, total: number) => Effect.Effect<void>;
	/** Compute everything, report it, but skip the write. Honors `--yes --dry-run`. */
	dryRun?: boolean;
	/** Workspace-backed resolver for entries with `source: "workspace"`. */
	workspaceResolver?: Resolver;
}): Effect.Effect<UpgradeRunResult, UpgradeError> {
	return Effect.gen(function* () {
		const { source, entries, skipped } = yield* readCatalogSource(opts.file);
		const gate = yield* computeGate(source, opts.file, opts.resolver);
		const versionsByPkg = yield* resolveGatedVersions(
			entries,
			opts.resolver,
			gate,
			Date.now(),
			opts.onProgress,
			opts.workspaceResolver,
		);

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
		const changedPkgs = new Map<string, CheckDriftRow>();
		const markChanged = (entry: CatalogEntry, to?: string): void => {
			changedSpans.add(entry.rangeSpan[0]);
			const name = `${entry.catalog}.${entry.pkg}`;
			changedPkgs.set(name, {
				name,
				catalog: entry.catalog,
				pkg: entry.pkg,
				from: entry.currentRange,
				...(to !== undefined ? { to } : {}),
				source: entry.source ?? "registry",
			});
		};

		for (const entry of entries) {
			if (entry.strategy === "interop") continue;
			const versions = versionsByPkg.gated.get(versionKeyOf(entry)) ?? [];
			const { range, setPeer } = entryEdits(entry);

			// Derive the entry's peer ONCE, up front, so the incompatibility warning is
			// collected wherever the entry lands below — range bump, offline resync, or
			// materialize — not only on the peer-only paths. A derivation FAILURE stays a
			// silent skip (the entry simply gets no peer edit); only a WARNING is fatal.
			const derived = entry.strategy
				? yield* derivePeerRange(entry.currentRange, entry.strategy).pipe(Effect.orElseSucceed(() => null))
				: null;
			if (derived?.warning) warnings.push(`${entry.pkg}: ${derived.warning.message}`);
			// The peer-only fallbacks when the range itself does not move: an existing
			// literal that drifted from the strategy is resynced; a strategy entry with
			// no literal yet gets one materialized from the current range (parity with
			// the interactive walk). Both work offline from the current range.
			const peerOnly =
				derived === null
					? null
					: entry.peer
						? derived.range === entry.peer.value
							? null
							: derived.range
						: derived.range;

			const candidates =
				versions.length === 0 ? [] : yield* planEntry(entry, versions).pipe(Effect.orElseSucceed(() => []));
			const pick = defaultPick(entry, candidates);
			if (pick) {
				edits.push(range(pick.range));
				markChanged(entry, pick.range);
				if (pick.peerRange) edits.push(setPeer(pick.peerRange));
			} else if (peerOnly !== null) {
				edits.push(setPeer(peerOnly));
				markChanged(entry);
			} else if (versions.length === 0) {
				skipped.push(`${entry.catalog}.${entry.pkg}`);
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
				const versions = versionsByPkg.gated.get(versionKeyOf(e)) ?? [];
				const cands = yield* planEntry(e, versions).pipe(Effect.orElseSucceed(() => []));
				const inRange = cands.find((c) => c.kind === "in-range");
				const ceiling = inRange ? inRange.version : bareVersion(e.currentRange);
				members.push({ pkg: e.pkg, ceiling, candidates: versions });
			}
			const result = yield* runInterop(members, opts.resolver);
			interopEdits.push(...buildInteropEdits(group, result));
			for (const e of group) {
				if (!interopEntryChanged(e, result)) continue;
				// Annotate the row with the new range when the range itself moved; a
				// peer-only interop change keeps `to` absent, like the strategy paths.
				const next = result.resolved.get(e.pkg);
				const nextRange = next === undefined ? undefined : `${e.operator}${next}`;
				markChanged(e, nextRange !== undefined && nextRange !== e.currentRange ? nextRange : undefined);
			}
			conflicts.push(...result.conflicts);
		}

		if (warnings.length > 0) {
			return yield* Effect.fail(
				new UpgradeError({
					message: `Refusing to apply with an incompatible peer strategy:\n${warnings.map((w) => `  ${w}`).join("\n")}`,
					kind: "peer-strategy",
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
		return {
			updated,
			skipped,
			conflicts,
			rejected,
			changed: [...changedPkgs.values()],
		};
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
		? "Nothing to upgrade — no catalog packages found."
		: `Nothing to upgrade — ${totalItems} package(s) already up to date.`;
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
		// Same pick rule as runUpgrade (--yes / --check), so this projection —
		// which backs --preview and the non-interactive terminal fallback — never
		// renders a pending bump as unchanged while --yes writes it.
		const pick = defaultPick(i.entry, i.candidates);
		if (pick) {
			out.push({ item: i, chosen: pick });
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

/**
 * Build the `--preview` projection without writing: the summary document, and
 * the packages the registry could not resolve (which render as up to date and
 * would otherwise be invisible in the projection).
 *
 * @internal
 */
export function runUpgradePreview(opts: {
	file: string;
	resolver: Resolver;
	full: boolean;
	/** Workspace-backed resolver for entries with `source: "workspace"`. */
	workspaceResolver?: Resolver;
}): Effect.Effect<{ readonly doc: Document; readonly unresolved: readonly string[] }, UpgradeError> {
	return Effect.gen(function* () {
		const { source, entries } = yield* readCatalogSource(opts.file);
		const gate = yield* computeGate(source, opts.file, opts.resolver);
		const versions = yield* resolveGatedVersions(
			entries,
			opts.resolver,
			gate,
			Date.now(),
			undefined,
			opts.workspaceResolver,
		);
		const items = yield* buildWalkItems(entries, versions.gated).pipe(
			Effect.mapError((e) => new UpgradeError({ message: e.message })),
		);
		return { doc: summaryDoc(projectDecisions(items, opts.full)), unresolved: versions.unresolved };
	});
}

/**
 * Map a check run's drift list to its report and exit code. `--check` is a
 * pure gate: exit 0 when every entry is in sync, exit 1 when an
 * `upgrade --yes` would rewrite anything — the exit code IS the contract (a
 * release validation phase calls this), and it never writes. Drift is a
 * finding, not a failure: the command succeeds and records the code with
 * `CliExit.set`.
 *
 * @internal
 */
export function checkOutcome(changed: readonly CheckDriftRow[]): { exitCode: 0 | 1; doc: Document } {
	if (changed.length === 0) {
		return { exitCode: 0, doc: [Doc.line("Catalogs are in sync.")] };
	}
	// Each row is annotated with its version source, so a mixed catalog's output
	// says which rows track the workspace and which track the registry.
	return {
		exitCode: 1,
		doc: [
			Doc.line(`Catalog drift detected in ${changed.length} package(s):`),
			Doc.lines(changed.map((c) => `  ${c.name}  (${c.source})`)),
			Doc.line(["Run ", Doc.code("rolldown-pnpm-config upgrade --yes"), " to apply."]),
		],
	};
}

/** Project a drift row to its stable `--json` object: catalog/pkg/from/to?/source, camelCase, `to` omitted (never null) when unknown. */
function driftRowJson(row: CheckDriftRow): Record<string, unknown> {
	return {
		catalog: row.catalog,
		pkg: row.pkg,
		from: row.from,
		...(row.to !== undefined ? { to: row.to } : {}),
		source: row.source,
	};
}

/**
 * The `--check --json` outcome. stdout carries exactly one single-line JSON
 * document (`json`, written with `Console.log`) in EVERY case — including the
 * resolution-failure family, which keeps its non-zero exit but must never
 * leave a bash gate with exit 1 and an empty stdout. A resolution failure is
 * also returned as `failure`, which the command fails with so the labelled
 * human report lands on stderr.
 *
 * @internal
 */
export function checkJsonOutcome(result: Result.Result<UpgradeRunResult, UpgradeError>): {
	exitCode: 0 | 1;
	json: string;
	failure?: CheckFailedError;
} {
	if (Result.isFailure(result)) {
		const { message, kind } = result.failure;
		return {
			exitCode: 1,
			json: JSON.stringify({ command: "check", inSync: false, error: { kind: kind ?? "resolution", message } }),
			failure: new CheckFailedError({ message, ...(kind !== undefined ? { kind } : {}) }),
		};
	}
	const changed = result.success.changed;
	return {
		exitCode: changed.length === 0 ? 0 : 1,
		json: JSON.stringify({ command: "check", inSync: changed.length === 0, drift: changed.map(driftRowJson) }),
	};
}

/**
 * The `--yes --json` / `--dry-run --json` outcome. `applied` reports whether
 * the run wrote at least one change — always false under dry-run AND on an
 * already-in-sync run, so a consumer keying on it never reads a no-op as a
 * real apply; `changed` uses the same row object as check's `drift`. A failure
 * emits an error document on stdout and is returned as `failure`, which the
 * command fails with (non-zero exit, human message on stderr); `error.kind` is
 * `"peer-strategy"` for a peer-strategy refusal and `"resolution"` otherwise.
 *
 * @internal
 */
export function upgradeJsonOutcome(
	result: Result.Result<UpgradeRunResult, UpgradeError>,
	dryRun: boolean,
): { json: string; failure?: UpgradeError } {
	if (Result.isFailure(result)) {
		const { message, kind } = result.failure;
		return {
			json: JSON.stringify({ command: "upgrade", applied: false, error: { kind: kind ?? "resolution", message } }),
			failure: result.failure,
		};
	}
	const r = result.success;
	return {
		json: JSON.stringify({
			command: "upgrade",
			applied: !dryRun && r.updated > 0,
			updated: r.updated,
			changed: r.changed.map(driftRowJson),
			skipped: r.skipped,
			conflicts: r.conflicts.map((c) => ({ pkg: c.pkg, ceiling: c.ceiling, blockedBy: c.blockedBy })),
		}),
	};
}

/**
 * Reject `--json` outside the non-interactive modes it exists for. JSON mode
 * is a machine contract (a GitHub Action parsing stdout from bash); the
 * interactive table and the preview views have no meaningful document to emit.
 * Returns the usage error to fail with (exit 64), or null when the combination
 * is valid.
 *
 * @internal
 */
export function validateJsonMode(flags: {
	json: boolean;
	check: boolean;
	yes: boolean;
	dryRun: boolean;
	preview: boolean;
}): UpgradeUsageError | null {
	if (!flags.json) return null;
	if (flags.preview) {
		return new UpgradeUsageError({
			message: "--json cannot be combined with --preview; use --check, --yes, or --dry-run",
		});
	}
	if (!flags.check && !flags.yes && !flags.dryRun) {
		return new UpgradeUsageError({
			message: "--json requires a non-interactive mode: combine it with --check, --yes, or --dry-run",
		});
	}
	return null;
}

/**
 * Resolve the target file: the passed path, or autodetect in the working
 * directory.
 *
 * @internal
 */
export function resolveTargetFile(
	fileOpt: Option.Option<string>,
): Effect.Effect<string, UpgradeError, WorkingDirectory> {
	return Effect.gen(function* () {
		const explicit = Option.getOrUndefined(fileOpt);
		if (explicit !== undefined) return explicit;
		const matches = yield* findConfigFiles(yield* WorkingDirectory);
		const picked = pickConfigCandidate(matches);
		if (!picked.ok) return yield* Effect.fail(new UpgradeError({ message: picked.message }));
		return picked.file;
	});
}

/** Print the unresolved-packages warning to stderr, when there is one. */
function warnUnresolved(unresolved: readonly string[]) {
	return unresolved.length > 0
		? printDoc(warningDoc(unresolvedMessage(unresolved)), { stream: "stderr" })
		: Effect.void;
}

/**
 * Resolve every entry's versions, then — for interop catalogs — pre-fetch the
 * peerDependencies of each candidate version so the live table can recompute
 * peer floors + conflicts as picks change (the same data `runInterop` fetches,
 * moved ahead of the walk). Interactively the live table IS the reconcile;
 * `--yes`/CI keeps the auto-reconcile (`runUpgrade`). Each phase reports
 * progress, which an interactive run draws as a live view.
 */
function resolveForWalk(
	entries: readonly CatalogEntry[],
	resolver: Resolver,
	gate: ReleaseAgeGate,
	workspaceResolver: Resolver,
	report: (event: ProgressEvent) => Effect.Effect<void>,
) {
	return Effect.gen(function* () {
		const versions = yield* resolveGatedVersions(
			entries,
			resolver,
			gate,
			Date.now(),
			resolveProgress(report),
			workspaceResolver,
		);
		const items = yield* buildWalkItems(entries, versions.gated).pipe(
			Effect.mapError((e) => new UpgradeError({ message: e.message })),
		);
		const interopByCatalog = new Map<string, CatalogEntry[]>();
		for (const e of entries) {
			if (e.strategy !== "interop") continue;
			const list = interopByCatalog.get(e.catalog) ?? [];
			list.push(e);
			interopByCatalog.set(e.catalog, list);
		}
		const interopModels = new Map<string, GroupModel>();
		if (interopByCatalog.size > 0) {
			const fetchPeer = makePeerFetcher(resolver);
			const total = interopByCatalog.size;
			yield* report({ _tag: "Phase", label: "Resolving peer dependencies", total });
			for (const [catalog, group] of interopByCatalog) {
				const candByPkg = new Map<string, string[]>();
				for (const e of group) {
					const it = items.find((i) => i.entry.catalog === catalog && i.entry.pkg === e.pkg);
					candByPkg.set(e.pkg, it ? it.candidates.map((c) => c.version) : [bareVersion(e.currentRange)]);
				}
				interopModels.set(catalog, yield* buildGroupModel(candByPkg, fetchPeer));
				yield* report({ _tag: "Step", done: interopModels.size });
			}
			yield* report({ _tag: "Finished", label: "Resolved peer dependencies" });
		}
		return { versions, items, interopByCatalog, interopModels };
	});
}

// No `mustExist`: the parser would reject a missing path as a usage error before
// the handler runs, leaving `--json` with an empty stdout. A missing file instead
// fails in `readCatalogSource` ("Cannot read …"), which the JSON paths report.
const fileArg = Argument.File("file").pipe(
	Argument.withDescription("The config file to upgrade (autodetected in the current directory when omitted)"),
	Argument.optional,
);
const yesFlag = Flag.Boolean("yes").pipe(
	Flag.withAlias("y"),
	Flag.withDescription("Apply the latest in-range version of every entry without asking (never a major)"),
	Flag.withDefault(false),
);
const dryRunFlag = Flag.Boolean("dry-run").pipe(
	Flag.withDescription("Run the whole flow and report what would change, but write nothing"),
	Flag.withDefault(false),
);
const catalogOption = Flag.String("catalog").pipe(
	Flag.withDescription("Only upgrade entries in the named catalog"),
	Flag.optional,
);
const previewFlag = Flag.Boolean("preview").pipe(
	Flag.withDescription("Print the default picks as a summary and exit"),
	Flag.withDefault(false),
);
const fullFlag = Flag.Boolean("full").pipe(
	Flag.withDescription("Include up-to-date packages in a printed summary"),
	Flag.withDefault(false),
);
const checkFlag = Flag.Boolean("check").pipe(
	Flag.withDescription("Exit 1 when --yes would change anything (a drift gate; never writes)"),
	Flag.withDefault(false),
);
const jsonFlag = Flag.Boolean("json").pipe(
	Flag.withDescription("Print one JSON document on stdout (with --check, --yes or --dry-run)"),
	Flag.withDefault(false),
);

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
	{
		file: fileArg,
		yes: yesFlag,
		dryRun: dryRunFlag,
		catalog: catalogOption,
		preview: previewFlag,
		full: fullFlag,
		check: checkFlag,
		json: jsonFlag,
	},
	({ file: fileOpt, yes, dryRun, catalog, preview, full, check, json }) =>
		Effect.gen(function* () {
			// JSON mode is for non-interactive consumers only — reject before touching
			// the filesystem so the usage error is fast and unambiguous.
			const jsonRejection = validateJsonMode({ json, check, yes, dryRun, preview });
			if (jsonRejection !== null) {
				return yield* Effect.fail(jsonRejection);
			}
			const resolver = yield* RegistryResolver;
			// Entries with `source: "workspace"` resolve from the workspace containing
			// the config file. Construction is lazy — a config with no workspace-sourced
			// entries never touches the filesystem through this resolver.
			const workspaceOf = (file: string) => makeWorkspaceResolver(findWorkspaceRoot(dirname(file)));
			// The non-interactive core, target discovery included, so that under --json
			// even "no config file found" lands in the result and still yields a document.
			const nonInteractive = (forceDryRun: boolean) =>
				resolveTargetFile(fileOpt).pipe(
					Effect.flatMap((file) =>
						runUpgrade({ file, resolver, workspaceResolver: workspaceOf(file), dryRun: forceDryRun || dryRun }),
					),
					Effect.result,
				);
			// --check is a pure drift gate: resolve exactly as --yes would, write
			// NOTHING (dryRun is forced regardless of other flags), and exit non-zero
			// when anything would have been rewritten.
			if (check) {
				const result = yield* nonInteractive(true);
				if (json) {
					// stdout carries exactly one JSON document (a bash consumer feeds it
					// straight to jq); the labelled human failure report goes to stderr.
					const o = checkJsonOutcome(result);
					yield* Console.log(o.json);
					if (o.failure !== undefined) return yield* Effect.fail(o.failure);
					return yield* CliExit.set(o.exitCode);
				}
				// A resolution failure (typo'd name, auth, peer warning) shares the
				// non-zero exit with drift, but its report must NOT read as drift — the
				// consuming gate reports every non-zero as "catalog drifted".
				if (Result.isFailure(result)) {
					const { message, kind } = result.failure;
					return yield* Effect.fail(new CheckFailedError({ message, ...(kind !== undefined ? { kind } : {}) }));
				}
				// Drift and in-sync are the gate's normal answers → stdout, exit by CliExit.
				const outcome = checkOutcome(result.success.changed);
				yield* printDoc(outcome.doc);
				return yield* CliExit.set(outcome.exitCode);
			}
			// `--yes --json` and `--dry-run --json`: the non-interactive core with a
			// machine-readable report. `--dry-run --json` runs the same resolution as
			// `--yes --dry-run` — JSON mode never enters the interactive walk.
			if (json) {
				const result = yield* nonInteractive(false);
				const o = upgradeJsonOutcome(result, dryRun);
				yield* Console.log(o.json);
				if (o.failure !== undefined) return yield* Effect.fail(o.failure);
				return;
			}
			const file = yield* resolveTargetFile(fileOpt);
			const workspaceResolver = workspaceOf(file);
			if (preview) {
				const { doc, unresolved } = yield* runUpgradePreview({ file, resolver, full, workspaceResolver });
				yield* printDoc(doc);
				// --preview must not hide a typo either: an unresolvable package renders as
				// up-to-date and would otherwise be invisible in the projection.
				return yield* warnUnresolved(unresolved);
			}
			if (yes) {
				const result = yield* withProgress((report) =>
					runUpgrade({ file, resolver, dryRun, workspaceResolver, onProgress: resolveProgress(report) }),
				);
				yield* dryRun
					? CliMessage.info(
							`Dry run — no changes written. ${result.updated} package(s) would be updated; skipped ${result.skipped.length}.`,
						)
					: CliMessage.success(`Updated ${result.updated} package(s); skipped ${result.skipped.length}.`);
				if (result.conflicts.length > 0) {
					const lines = result.conflicts.map((c) => `  ${c.pkg} (kept ${c.ceiling}) blocked by ${c.blockedBy}`);
					yield* printDoc(warningDoc(["Interop conflicts (left at your pick):", ...lines].join("\n")), {
						stream: "stderr",
					});
				}
				return;
			}
			const { source, entries: discovered } = yield* readCatalogSource(file);
			const entries = filterEntriesByCatalog(discovered, Option.getOrUndefined(catalog));
			const gate = yield* computeGate(source, file, resolver);
			// --dry-run is NOT a separate code path: it runs the identical interactive
			// flow (table → picks → interop reconcile → validate → summary) and skips
			// only the final write. Short-circuiting here instead would show a table of
			// auto-picked defaults the user never got to choose, and would silently skip
			// the interop reconcile — so the "preview" would not match what an apply does.
			if (!(yield* CliInteractive)) {
				const versions = yield* resolveGatedVersions(entries, resolver, gate, Date.now(), undefined, workspaceResolver);
				const items = yield* buildWalkItems(entries, versions.gated).pipe(
					Effect.mapError((e) => new UpgradeError({ message: e.message })),
				);
				const note = dryRun
					? "(dry run — nothing written)"
					: "(not interactive — run with --yes to apply, or in a terminal to choose)";
				yield* printDoc([
					...summaryDoc(projectDecisions(items, full)),
					Doc.line(""),
					Doc.line(Doc.text(note, "muted")),
				]);
				return yield* warnUnresolved(versions.unresolved);
			}
			const { versions, items, interopByCatalog, interopModels } = yield* withProgress((report) =>
				resolveForWalk(entries, resolver, gate, workspaceResolver, report),
			);
			// Show every discovered row — up-to-date rows included, as non-selectable
			// context — so a fully up-to-date catalog is never hidden from the table.
			// The cursor starts on the first actionable row (see initTable). Only bail
			// when nothing at all was discovered.
			if (items.length === 0) {
				// An unresolvable package plans to keep-only and so counts as "up to date".
				// Reporting only "nothing to upgrade" here would hide the typo completely —
				// the exact silent-omission this warning exists to prevent.
				yield* warnUnresolved(versions.unresolved);
				return yield* CliMessage.info(nothingToUpgradeMessage(0));
			}
			// Esc / Ctrl-C end the table as `Cancelled`, which `CliRuntime.main` reports
			// as one line with exit 130 — nothing below runs, so nothing is written.
			const decisions = yield* CliUi.run(walkScreen({ items, dryRun, unresolved: versions.unresolved, interopModels }));

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
					selected.set(e.pkg, d ? d.chosen.version : bareVersion(e.currentRange));
				}
				const { peer, conflict } = computeGroupPeers(model, selected);
				interopEdits.push(...buildInteropEdits(group, { resolved: selected, peers: peer, conflicts: [] }));
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

			yield* printDoc(summaryDoc(decisions, { conflicts: allConflicts }, rejected));
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
			yield* dryRun
				? CliMessage.info(`Dry run — no changes written. ${changed} change(s) would be applied.`)
				: CliMessage.success(`Applied ${changed} change(s).`);
			// Repeat the unresolved warning after the run: the in-table banner is gone
			// once the screen unmounts, and this is the last thing the author reads.
			yield* warnUnresolved(versions.unresolved);
		}).pipe(Effect.provide(RegistryResolverLive)),
).pipe(Command.withDescription("Upgrade catalog versions in a config file"));
