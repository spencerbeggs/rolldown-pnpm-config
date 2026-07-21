import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Data, Effect, Option } from "effect";
import { Argument, Command } from "effect/unstable/cli";
import { freeze } from "../../plugin/freeze.js";
import { resolveRootName } from "../../runtime/ctx.js";
import { evaluatePluginConfig } from "../evaluate.js";
import { buildPreviewViews } from "../preview-views.js";
import { findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { toAnsi } from "../ui/ansi.js";
import { detectCapabilities } from "../ui/env.js";
import { legendLines } from "../ui/legend.js";
import { runPreview } from "../ui/run-preview.js";
import { findWorkspaceFile, parseWorkspace } from "../workspace-file.js";
import { WORKSPACE_FIELDS } from "./export.js";

/** Typed failure for the preview run. @internal */
export class PreviewError extends Data.TaggedError("PreviewError")<{ readonly message: string }> {}

/**
 * Build the three preview views from a config + workspace file. Pure of any
 * terminal interaction; the command wraps this with interactive/non-TTY output.
 *
 * @internal
 */
export function runPreviewViews(opts: { configFile: string; workspacePath?: string }) {
	return Effect.gen(function* () {
		const configSource = yield* Effect.try({
			try: () => readFileSync(opts.configFile, "utf8"),
			catch: () => new PreviewError({ message: `Cannot read ${opts.configFile}` }),
		});
		const { config, errors } = evaluatePluginConfig(configSource, opts.configFile);
		if (config === null)
			return yield* Effect.fail(new PreviewError({ message: `No PnpmConfigPlugin call found in ${opts.configFile}` }));
		if (errors.length > 0)
			return yield* Effect.fail(new PreviewError({ message: `Non-literal config values: ${errors.join("; ")}` }));

		const { base, manifest } = yield* freeze(config as unknown as Parameters<typeof freeze>[0]).pipe(
			Effect.mapError((e) => new PreviewError({ message: e.message })),
		);
		const managed: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(base)) if (WORKSPACE_FIELDS.has(k)) managed[k] = v;

		const path = opts.workspacePath ?? findWorkspaceFile(process.cwd()) ?? join(process.cwd(), "pnpm-workspace.yaml");
		const parsed = existsSync(path)
			? yield* Effect.try({
					try: () => parseWorkspace(readFileSync(path, "utf8")),
					catch: (e) => new PreviewError({ message: `Cannot read or parse ${path}: ${String(e)}` }),
				})
			: {};
		const localCfg =
			config.local && typeof config.local === "object" ? (config.local as Record<string, unknown>) : undefined;
		return buildPreviewViews({
			managed,
			...(localCfg ? { local: localCfg } : {}),
			parsed,
			manifest,
			rootName: resolveRootName({ dir: dirname(path) }),
		});
	});
}

const pathArg = Argument.file("path").pipe(Argument.optional);

/**
 * The "preview" command: interactive ink-tab explorer of the export diff
 * (Changes / Full / Simulated). Falls back to printing the Changes view when
 * the terminal is non-interactive.
 *
 * @internal
 */
export const previewCommand = Command.make("preview", { path: pathArg }, ({ path }) =>
	Effect.gen(function* () {
		const matches = yield* findConfigFiles(process.cwd());
		const picked = pickConfigCandidate(matches);
		if (!picked.ok) return yield* Effect.fail(new PreviewError({ message: picked.message }));
		const workspacePath = Option.getOrUndefined(path);
		const views = yield* runPreviewViews({
			configFile: picked.file,
			...(workspacePath !== undefined ? { workspacePath } : {}),
		});
		const caps = detectCapabilities();
		if (caps.interactive) {
			yield* runPreview(views);
		} else {
			yield* Effect.sync(() => {
				const legend = caps.color ? `${toAnsi(legendLines(), { color: caps.color })}\n\n` : "";
				process.stdout.write(`${legend}${toAnsi(views.changes, { color: caps.color })}\n`);
			});
		}
	}),
).pipe(Command.withDescription("Interactively preview how pnpm-workspace.yaml would change"));
