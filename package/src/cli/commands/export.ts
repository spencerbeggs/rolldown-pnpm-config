import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Data, Effect, Option } from "effect";
import { DESCRIPTORS } from "../../descriptors/index.js";
import { freeze } from "../../plugin/freeze.js";
import { resolveRootName } from "../../runtime/ctx.js";
import { buildDiff } from "../diff/build.js";
import { renderExportDiff } from "../diff/render.js";
import type { DiffNode } from "../diff/types.js";
import { effectiveManaged } from "../effective.js";
import { evaluatePluginConfig } from "../evaluate.js";
import { findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { toAnsi } from "../ui/ansi.js";
import { detectCapabilities } from "../ui/env.js";
import type { StyledLine } from "../ui/styled.js";
import { canonicalize, findWorkspaceFile, parseWorkspace, renderWorkspace } from "../workspace-file.js";
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
}): Effect.Effect<{ path: string; rendered: string; written: boolean; diff: StyledLine[] }, ExportError> {
	return Effect.gen(function* () {
		const configSource = yield* Effect.try({
			try: () => readFileSync(opts.configFile, "utf8"),
			catch: () => new ExportError({ message: `Cannot read ${opts.configFile}` }),
		});
		const { config, errors } = evaluatePluginConfig(configSource, opts.configFile);
		if (config === null) {
			return yield* Effect.fail(new ExportError({ message: `No PnpmConfigPlugin call found in ${opts.configFile}` }));
		}
		if (errors.length > 0) {
			return yield* Effect.fail(new ExportError({ message: `Non-literal config values: ${errors.join("; ")}` }));
		}
		const { base, manifest } = yield* freeze(config as unknown as Parameters<typeof freeze>[0]).pipe(
			Effect.mapError((e) => new ExportError({ message: e.message })),
		);
		const managed: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(base)) {
			if (WORKSPACE_FIELDS.has(k)) managed[k] = v;
		}

		const path = opts.workspacePath ?? findWorkspaceFile(process.cwd()) ?? join(process.cwd(), "pnpm-workspace.yaml");
		const parsed = existsSync(path)
			? yield* Effect.try({
					try: () => parseWorkspace(readFileSync(path, "utf8")),
					catch: (e) => new ExportError({ message: `Cannot read or parse ${path}: ${String(e)}` }),
				})
			: {};

		const rootName = resolveRootName({ dir: dirname(path) });
		const localCfg =
			config.local && typeof config.local === "object" ? (config.local as Record<string, unknown>) : undefined;
		const effective = effectiveManaged(managed, localCfg, parsed, manifest, rootName);
		const merged = overlayWorkspace(effective, parsed);
		const rendered = renderWorkspace(merged);
		const localKeys = new Set(
			config.local && typeof config.local === "object" ? Object.keys(config.local as Record<string, unknown>) : [],
		);
		const tree: DiffNode = buildDiff(
			canonicalize(parsed) as Record<string, unknown>,
			canonicalize(merged) as Record<string, unknown>,
			{ localKeys, managedKeys: WORKSPACE_FIELDS },
		);
		const diff = renderExportDiff(tree, { full: opts.full ?? false });

		if (opts.preview) return { path, rendered, written: false, diff };
		yield* Effect.try({
			try: () => writeFileSync(path, rendered, "utf8"),
			catch: () => new ExportError({ message: `Cannot write ${path}` }),
		});
		return { path, rendered, written: true, diff };
	});
}

const pathArg = Args.file({ name: "path" }).pipe(Args.optional);
const dryRunFlag = Options.boolean("dry-run").pipe(Options.withDefault(false));
const fullFlag = Options.boolean("full").pipe(Options.withDefault(false));

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
					process.stdout.write(`${toAnsi(result.diff, { color: caps.color })}\n`);
					process.stdout.write("\n+ added  ~ changed  - removed   (local) local override  (unmanaged) not managed\n");
				} else process.stdout.write(`Exported to ${result.path}\n`);
			});
		}),
).pipe(Command.withDescription("Materialize the plugin config into pnpm-workspace.yaml (--dry-run to preview)"));
