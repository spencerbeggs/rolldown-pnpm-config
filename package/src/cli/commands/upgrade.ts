import { readFileSync, writeFileSync } from "node:fs";
import { Args, Command, Options } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Data, Effect, Option } from "effect";
import { discoverCatalogEntries } from "../discover.js";
import { detectPeerDrift } from "../drift.js";
import { buildEdits } from "../edits.js";
import { evaluatePluginConfig } from "../evaluate.js";
import type { GroupMember, InteropConflict } from "../interop.js";
import { runInterop } from "../interop.js";
import { derivePeerRange } from "../peer-range.js";
import { planEntry } from "../plan.js";
import type { ReleaseAgeGate } from "../release-age.js";
import { combineReleaseAge, filterByReleaseAge, parsePnpmGate, readConfigReleaseAge } from "../release-age.js";
import { RegistryResolver, RegistryResolverLive } from "../resolve.js";
import { applyEdits } from "../rewrite.js";
import { filterEntriesByCatalog, findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { renderSummary } from "../summary.js";
import type { CatalogEntry, Edit } from "../types.js";
import { runWalk } from "../ui/run-walk.js";
import { buildWalkItems } from "../walk-plan.js";
import type { Decision } from "../walk-types.js";

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
		const { config } = evaluatePluginConfig(source, file);
		const cfg = readConfigReleaseAge(config);
		const age = yield* resolver.pnpmConfig("minimumReleaseAge").pipe(Effect.catchAll(() => Effect.succeed(null)));
		const exc = yield* resolver
			.pnpmConfig("minimumReleaseAgeExclude")
			.pipe(Effect.catchAll(() => Effect.succeed(null)));
		return combineReleaseAge(cfg, parsePnpmGate(age, exc));
	});
}

/** Fetch and age-gate the version list for each unique package. @internal */
export function resolveGatedVersions(
	entries: readonly CatalogEntry[],
	resolver: Resolver,
	gate: ReleaseAgeGate,
	now: number,
): Effect.Effect<Map<string, string[]>, never> {
	return Effect.gen(function* () {
		const out = new Map<string, string[]>();
		for (const pkg of new Set(entries.map((e) => e.pkg))) {
			const vr = yield* resolver.versions(pkg).pipe(Effect.either);
			if (vr._tag === "Left") {
				out.set(pkg, []);
				continue;
			}
			const times = yield* resolver.times(pkg).pipe(Effect.catchAll(() => Effect.succeed({})));
			out.set(pkg, filterByReleaseAge(vr.right, times, gate, pkg, now));
		}
		return out;
	});
}

/**
 * Non-interactive upgrade core: read the config, discover catalog entries,
 * resolve + plan each, build edits for the latest-IN-RANGE candidate (and its
 * recomputed peer literal), and write the file. Never selects a major bump.
 *
 * @internal
 */
export function runUpgrade(opts: {
	file: string;
	resolver: Resolver;
}): Effect.Effect<{ updated: number; skipped: string[]; conflicts: InteropConflict[] }, UpgradeError> {
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
		const versionsByPkg = yield* resolveGatedVersions(entries, opts.resolver, gate, Date.now());
		const edits: Edit[] = [];
		const changedSpans = new Set<number>();

		for (const entry of entries) {
			if (entry.strategy === "interop") continue;
			const versions = versionsByPkg.get(entry.pkg) ?? [];
			if (versions.length === 0) {
				skipped.push(`${entry.catalog}.${entry.pkg}`);
				continue;
			}
			const candidates = yield* planEntry(entry, versions).pipe(Effect.catchAll(() => Effect.succeed([])));
			const inRange = candidates.find((c) => c.kind === "in-range");
			const at = entry.rangeSpan[1];
			if (inRange) {
				edits.push({ span: entry.rangeSpan, text: JSON.stringify(inRange.range) });
				changedSpans.add(entry.rangeSpan[0]);
				if (entry.peer && inRange.peerRange) {
					edits.push({ span: entry.peer.span, text: JSON.stringify(inRange.peerRange) });
				} else if (!entry.peer && entry.strategy && inRange.peerRange) {
					edits.push({ span: [at, at], text: `, peer: ${JSON.stringify(inRange.peerRange)}` });
				}
			} else if (!entry.peer && entry.strategy) {
				// Already at newest, but the strategy declares a managed peer that does not exist yet:
				// materialize it from the current range.
				const peerRange = yield* derivePeerRange(entry.currentRange, entry.strategy).pipe(
					Effect.catchAll(() => Effect.succeed(null)),
				);
				if (peerRange !== null) {
					edits.push({ span: [at, at], text: `, peer: ${JSON.stringify(peerRange)}` });
					changedSpans.add(entry.rangeSpan[0]);
				}
			} else if (entry.peer && entry.strategy) {
				// Already at newest, but an existing peer literal may have drifted from
				// the strategy: resync it (parity with the interactive walk).
				const expected = yield* detectPeerDrift(entry).pipe(Effect.catchAll(() => Effect.succeed(null)));
				if (expected !== null) {
					edits.push({ span: entry.peer.span, text: JSON.stringify(expected) });
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
				const versions = versionsByPkg.get(e.pkg) ?? [];
				const cands = yield* planEntry(e, versions).pipe(Effect.catchAll(() => Effect.succeed([])));
				const inRange = cands.find((c) => c.kind === "in-range");
				const ceiling = inRange ? inRange.version : e.currentRange.replace(/^[\^~]/, "");
				members.push({ pkg: e.pkg, ceiling, candidates: versions });
			}
			const result = yield* runInterop(members, opts.resolver);
			conflicts.push(...result.conflicts);
			for (const e of group) {
				const version = result.resolved.get(e.pkg);
				const peer = result.peers.get(e.pkg);
				if (version === undefined) continue;
				const newRange = `${e.operator}${version}`;
				if (newRange !== e.currentRange) {
					edits.push({ span: e.rangeSpan, text: JSON.stringify(newRange) });
					changedSpans.add(e.rangeSpan[0]);
				}
				const at = e.rangeSpan[1];
				if (peer !== undefined) {
					if (e.peer && peer !== e.peer.value) {
						edits.push({ span: e.peer.span, text: JSON.stringify(peer) });
						changedSpans.add(e.rangeSpan[0]);
					} else if (!e.peer) {
						edits.push({ span: [at, at], text: `, peer: ${JSON.stringify(peer)}` });
						changedSpans.add(e.rangeSpan[0]);
					}
				}
			}
		}

		if (edits.length > 0) {
			const next = applyEdits(source, edits);
			yield* Effect.try({
				try: () => writeFileSync(opts.file, next, "utf8"),
				catch: () => new UpgradeError({ message: `Cannot write ${opts.file}` }),
			});
		}

		const updated = changedSpans.size;
		return { updated, skipped, conflicts };
	});
}

/**
 * Apply decisions to the file, returning the number of changed entries.
 *
 * @internal
 */
export function applyDecisions(
	file: string,
	source: string,
	decisions: readonly Decision[],
): Effect.Effect<number, UpgradeError> {
	return Effect.gen(function* () {
		const edits = buildEdits(decisions);
		if (edits.length > 0) {
			const next = applyEdits(source, edits);
			yield* Effect.try({
				try: () => writeFileSync(file, next, "utf8"),
				catch: () => new UpgradeError({ message: `Cannot write ${file}` }),
			});
		}
		const changedCount = decisions.filter(
			(d) =>
				d.chosen.kind !== "keep" ||
				(d.item.entry.peer !== undefined && d.item.driftPeer !== null) ||
				(d.item.entry.peer === undefined && d.item.materializePeer !== null),
		).length;
		return changedCount;
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

const fileArg = Args.file({ name: "file", exists: "yes" }).pipe(Args.optional);
const yesFlag = Options.boolean("yes").pipe(Options.withAlias("y"), Options.withDefault(false));
const dryRunFlag = Options.boolean("dry-run").pipe(Options.withDefault(false));
const catalogOption = Options.text("catalog").pipe(Options.optional);

/**
 * The "upgrade" command. The default path runs the interactive walk;
 * --yes applies latest-in-range non-interactively; --dry-run prints the
 * summary without writing; --catalog restricts to a single catalog by name.
 *
 * @internal
 */
export const upgradeCommand = Command.make(
	"upgrade",
	{ file: fileArg, yes: yesFlag, dryRun: dryRunFlag, catalog: catalogOption },
	({ file: fileOpt, yes, dryRun, catalog }) =>
		Effect.gen(function* () {
			const file = yield* resolveTargetFile(fileOpt);
			const resolver = yield* RegistryResolver;
			if (yes) {
				const result = yield* runUpgrade({ file, resolver });
				yield* Effect.sync(() =>
					process.stdout.write(`Updated ${result.updated} package(s); skipped ${result.skipped.length}.\n`),
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
			const versions = yield* resolveGatedVersions(entries, resolver, gate, Date.now());
			const items = yield* buildWalkItems(entries, versions).pipe(
				Effect.catchAll((e) => Effect.fail(new UpgradeError({ message: e.message }))),
			);
			// --dry-run: preview what the non-interactive apply would do — in-range bumps,
			// plus peer-only resyncs/materializations (rendered via a keep decision).
			const decisions: readonly Decision[] = dryRun
				? items
						.map((i): Decision | null => {
							const inRange = i.candidates.find((c) => c.kind === "in-range");
							if (inRange) return { item: i, chosen: inRange };
							if (i.driftPeer !== null || i.materializePeer !== null) {
								const keep = i.candidates.find((c) => c.kind === "keep");
								if (keep) return { item: i, chosen: keep };
							}
							return null;
						})
						.filter((d): d is Decision => d !== null)
				: yield* runWalk(items);
			yield* Effect.sync(() => process.stdout.write(`${renderSummary(decisions)}\n`));
			if (dryRun) return;
			const changed = yield* applyDecisions(file, source, decisions);
			yield* Effect.sync(() => process.stdout.write(`Applied ${changed} change(s).\n`));
		}).pipe(Effect.provide(RegistryResolverLive), Effect.provide(NodeContext.layer)),
).pipe(Command.withDescription("Upgrade catalog versions in a config file"));
