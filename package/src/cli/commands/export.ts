import { existsSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { Data, Effect, Option, Predicate } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import type { PluginConfig } from "../../define-plugin.js";
import { DESCRIPTORS } from "../../descriptors/index.js";
import { discoverOwnedPatches, withResolvedBuildPatches } from "../../patches/build.js";
import type { PatchReconcileReport } from "../../patches/reconcile.js";
import { reconcilePatches } from "../../patches/reconcile.js";
import { freeze } from "../../plugin/freeze.js";
import { resolveRootName } from "../../runtime/ctx.js";
import { buildDiff } from "../diff/build.js";
import { renderExportDiff } from "../diff/render.js";
import type { DiffNode } from "../diff/types.js";
import { effectiveManaged } from "../effective.js";
import { loadConfigAndWorkspace } from "../load-config.js";
import { findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { toAnsi } from "../ui/ansi.js";
import { detectCapabilities } from "../ui/env.js";
import { legendLines } from "../ui/legend.js";
import type { StyledLine } from "../ui/styled.js";
import { canonicalize, renderWorkspace } from "../workspace-file.js";
import { overlayWorkspace } from "../workspace-overlay.js";

/**
 * Typed failure raised when the export run cannot complete.
 *
 * @internal
 */
export class ExportError extends Data.TaggedError("ExportError")<{ readonly message: string }> {}

/**
 * The set of pnpm config keys that belong in pnpm-workspace.yaml
 * (i.e. descriptors with `workspaceYaml: true`).
 *
 * @internal
 */
export const WORKSPACE_FIELDS: ReadonlySet<string> = new Set(
	Object.entries(DESCRIPTORS)
		.filter(([, d]) => d.workspaceYaml)
		.map(([k]) => k),
);

/**
 * Export core: freeze the plugin config first, then apply excludeByRepo and
 * local directives via the effective pipeline, overlay onto the existing
 * pnpm-workspace.yaml (or create fresh), and write the result. In preview
 * mode nothing is written.
 *
 * @internal
 */
export function runExport(opts: {
	configFile: string;
	workspacePath?: string;
	preview: boolean;
	full?: boolean;
}): Effect.Effect<
	{ path: string; rendered: string; written: boolean; diff: StyledLine[]; report: PatchReconcileReport },
	ExportError
> {
	return Effect.gen(function* () {
		const { config, localCfg, path, parsed } = yield* loadConfigAndWorkspace(
			opts,
			(message) => new ExportError({ message }),
		);
		const pluginConfig = config as unknown as PluginConfig;
		// Discovery runs at most once: the build-side resolution and the export-side
		// local-path merge below both read the same owned-patch list.
		const owned = discoverOwnedPatches(pluginConfig, dirname(opts.configFile));
		const resolvedConfig = withResolvedBuildPatches(pluginConfig, dirname(opts.configFile), owned);
		const { base, manifest } = yield* freeze(resolvedConfig).pipe(
			Effect.mapError((e) => new ExportError({ message: e.message })),
		);
		const managed: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(base)) {
			if (WORKSPACE_FIELDS.has(k)) managed[k] = v;
		}

		const rootName = resolveRootName({ dir: dirname(path) });
		const effective = effectiveManaged(managed, localCfg, parsed, manifest, rootName);
		// patchedDependencies is special-cased on export. This plugin's patches —
		// the hand-authored explicit map as-is, or the discovered owned patches
		// rewritten to LOCAL on-disk paths — are merged OVER the existing workspace
		// entries so sibling plugins' and the repo's own registrations survive
		// (`overlayWorkspace` replaces this field wholesale, so the merge must
		// happen here). An explicit map skips discovery entirely, mirroring the
		// build side (withResolvedBuildPatches) so the escape hatch behaves the
		// same on build and export; the distributed `.pnpm-config` paths in `base`
		// are for consumers, never this repo.
		const explicitPatchMap = owned === undefined;
		const contributed: Record<string, string> = {};
		if (explicitPatchMap) {
			if (Predicate.isObject(effective.patchedDependencies)) {
				Object.assign(contributed, effective.patchedDependencies as Record<string, string>);
			}
		} else {
			const workspaceRoot = dirname(path);
			for (const p of owned) contributed[p.key] = relative(workspaceRoot, p.absPath).split(/[\\/]/).join("/");
		}
		if (Object.keys(contributed).length > 0) {
			const existing = parsed.patchedDependencies as Record<string, string> | undefined;
			effective.patchedDependencies = { ...(existing ?? {}), ...contributed };
		}
		const report: PatchReconcileReport = reconcilePatches({
			parsedPatched: (effective.patchedDependencies as Record<string, string> | undefined) ?? {},
			root: dirname(path),
			exists: existsSync,
		});
		const merged = overlayWorkspace(effective, parsed);
		const rendered = renderWorkspace(merged);
		const localKeys = new Set(Object.keys(localCfg ?? {}));
		const tree: DiffNode = buildDiff(
			canonicalize(parsed) as Record<string, unknown>,
			canonicalize(merged) as Record<string, unknown>,
			{ localKeys, managedKeys: WORKSPACE_FIELDS },
		);
		const diff = renderExportDiff(tree, { full: opts.full ?? false });

		if (opts.preview) return { path, rendered, written: false, diff, report };
		yield* Effect.try({
			try: () => writeFileSync(path, rendered, "utf8"),
			catch: () => new ExportError({ message: `Cannot write ${path}` }),
		});
		return { path, rendered, written: true, diff, report };
	});
}

const pathArg = Argument.File("path").pipe(Argument.optional);
const dryRunFlag = Flag.Boolean("dry-run").pipe(Flag.withDefault(false));
const fullFlag = Flag.Boolean("full").pipe(Flag.withDefault(false));

/**
 * The "export" command. Materializes the plugin config into pnpm-workspace.yaml.
 * An optional path argument overrides the auto-detected workspace file. --dry-run
 * prints the colored diff to stdout without writing. --full disables context
 * collapsing in the diff output.
 *
 * @internal
 */
export const exportCommand = Command.make(
	"export",
	{ path: pathArg, dryRun: dryRunFlag, full: fullFlag },
	({ path, dryRun, full }) =>
		Effect.gen(function* () {
			const matches = yield* findConfigFiles(process.cwd());
			const picked = pickConfigCandidate(matches);
			if (!picked.ok) return yield* Effect.fail(new ExportError({ message: picked.message }));
			const workspacePath = Option.getOrUndefined(path);
			const result = yield* runExport({
				configFile: picked.file,
				...(workspacePath !== undefined ? { workspacePath } : {}),
				preview: dryRun,
				full,
			});
			yield* Effect.sync(() => {
				if (dryRun) {
					const caps = detectCapabilities();
					process.stdout.write(`${result.path} (dry run — not written)\n\n`);
					const legend = caps.color ? `${toAnsi(legendLines(), { color: caps.color })}\n\n` : "";
					process.stdout.write(`${legend}${toAnsi(result.diff, { color: caps.color })}\n`);
				} else process.stdout.write(`Exported to ${result.path}\n`);
				for (const k of result.report.staleEntries)
					process.stderr.write(`warning: patch entry "${k}" has no file on disk\n`);
				for (const k of result.report.keyMismatches)
					process.stderr.write(`warning: patch entry "${k}" does not match its filename\n`);
			});
		}),
).pipe(Command.withDescription("Materialize the plugin config into pnpm-workspace.yaml (--dry-run to preview)"));
