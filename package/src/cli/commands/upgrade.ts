import { readFileSync, writeFileSync } from "node:fs";
import { Args, Command, Options } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Data, Effect, Option } from "effect";
import { discoverCatalogEntries } from "../discover.js";
import { detectPeerDrift } from "../drift.js";
import { buildEdits } from "../edits.js";
import { derivePeerRange } from "../peer-range.js";
import { planEntry } from "../plan.js";
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
}): Effect.Effect<{ updated: number; skipped: string[] }, UpgradeError> {
	return Effect.gen(function* () {
		const source = yield* Effect.try({
			try: () => readFileSync(opts.file, "utf8"),
			catch: () => new UpgradeError({ message: `Cannot read ${opts.file}` }),
		});
		const { entries, skipped } = yield* Effect.try({
			try: () => discoverCatalogEntries(source, opts.file),
			catch: (e) => new UpgradeError({ message: String(e) }),
		});
		const edits: Edit[] = [];
		const changedSpans = new Set<number>();

		for (const entry of entries) {
			const vr = yield* opts.resolver.versions(entry.pkg).pipe(Effect.either);
			if (vr._tag === "Left") {
				skipped.push(`${entry.catalog}.${entry.pkg}`);
				continue;
			}
			const versions = vr.right;
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

		if (edits.length > 0) {
			const next = applyEdits(source, edits);
			yield* Effect.try({
				try: () => writeFileSync(opts.file, next, "utf8"),
				catch: () => new UpgradeError({ message: `Cannot write ${opts.file}` }),
			});
		}

		const updated = changedSpans.size;
		return { updated, skipped };
	});
}

/**
 * Resolve published versions per unique package, swallowing per-package
 * failures to []. Mirrors the skip behavior in runUpgrade.
 *
 * @internal
 */
export function resolveVersions(
	entries: readonly CatalogEntry[],
	resolver: Resolver,
): Effect.Effect<Map<string, string[]>, never> {
	return Effect.gen(function* () {
		const out = new Map<string, string[]>();
		for (const pkg of new Set(entries.map((e) => e.pkg))) {
			const vr = yield* resolver.versions(pkg).pipe(Effect.either);
			out.set(pkg, vr._tag === "Right" ? vr.right : []);
		}
		return out;
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
			const versions = yield* resolveVersions(entries, resolver);
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
