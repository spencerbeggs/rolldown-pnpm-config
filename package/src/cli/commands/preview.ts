import { dirname } from "node:path";
import { Data, Effect, Option } from "effect";
import { Argument, Command } from "effect/unstable/cli";
import { freeze } from "../../plugin/freeze.js";
import { resolveRootName } from "../../runtime/ctx.js";
import { loadConfigAndWorkspace } from "../load-config.js";
import { buildPreviewViews } from "../preview-views.js";
import { findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { toAnsi } from "../ui/ansi.js";
import { detectCapabilities } from "../ui/env.js";
import { legendLines } from "../ui/legend.js";
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
		const { config, localCfg, path, parsed } = yield* loadConfigAndWorkspace(
			opts,
			(message) => new PreviewError({ message }),
		);
		const { base, manifest } = yield* freeze(config as unknown as Parameters<typeof freeze>[0]).pipe(
			Effect.mapError((e) => new PreviewError({ message: e.message })),
		);
		const managed: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(base)) if (WORKSPACE_FIELDS.has(k)) managed[k] = v;
		return buildPreviewViews({
			managed,
			...(localCfg ? { local: localCfg } : {}),
			parsed,
			manifest,
			rootName: resolveRootName({ dir: dirname(path) }),
		});
	});
}

const pathArg = Argument.File("path").pipe(Argument.optional);

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
			// Ink (+ React) is loaded only when a table will actually render.
			const { runPreview } = yield* Effect.promise(() => import("../ui/run-preview.js"));
			yield* runPreview(views);
		} else {
			yield* Effect.sync(() => {
				const legend = caps.color ? `${toAnsi(legendLines(), { color: caps.color })}\n\n` : "";
				process.stdout.write(`${legend}${toAnsi(views.changes, { color: caps.color })}\n`);
			});
		}
	}),
).pipe(Command.withDescription("Interactively preview how pnpm-workspace.yaml would change"));
