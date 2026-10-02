import { dirname } from "node:path";
import type { Document } from "@effected/cli";
import { CliDoc, CliInteractive } from "@effected/cli";
import { CliUi } from "@effected/cli/ui";
import { Data, Effect, Option } from "effect";
import { Argument, Command } from "effect/cli";
import { freeze } from "../../plugin/freeze.js";
import { resolveRootName } from "../../runtime/ctx.js";
import { WorkingDirectory, resolveWorkspacePath } from "../cwd.js";
import { loadConfigAndWorkspace } from "../load-config.js";
import { buildPreviewViews } from "../preview-views.js";
import { legend } from "../render/legend.js";
import { printView } from "../render/print.js";
import { failureDoc } from "../render/report.js";
import { findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { previewScreen } from "../ui/screens.js";
import { WORKSPACE_FIELDS } from "./export.js";

/** Typed failure for the preview run. @internal */
export class PreviewError extends Data.TaggedError("PreviewError")<{ readonly message: string }> {
	/** The failure report `CliRuntime.main` prints: the message, without the class name. */
	[CliDoc](): Document {
		return failureDoc(this.message);
	}
}

/**
 * Build the three preview views from a config + workspace file. Pure of any
 * terminal interaction; the command wraps this with interactive/non-interactive output.
 *
 * @internal
 */
export function runPreviewViews(opts: { configFile: string; workspacePath: string }) {
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

const pathArg = Argument.File("path").pipe(
	Argument.withDescription("The pnpm-workspace.yaml to preview against (the nearest one upward when omitted)"),
	Argument.optional,
);

/**
 * The "preview" command: an interactive tabbed explorer of the export diff
 * (Changes / Full / Simulated). When the run cannot prompt — a pipe, CI, an
 * agent — it prints the Changes view instead. The explorer is read-only, so
 * closing it any way (q, Enter, Esc, Ctrl-C) is a normal exit.
 *
 * @internal
 */
export const previewCommand = Command.make("preview", { path: pathArg }, ({ path }) =>
	Effect.gen(function* () {
		const matches = yield* findConfigFiles(yield* WorkingDirectory);
		const picked = pickConfigCandidate(matches);
		if (!picked.ok) return yield* Effect.fail(new PreviewError({ message: picked.message }));
		const views = yield* runPreviewViews({
			configFile: picked.file,
			workspacePath: yield* resolveWorkspacePath(Option.getOrUndefined(path)),
		});
		if (!(yield* CliInteractive)) return yield* printView(views.changes, { legend: legend() });
		yield* CliUi.run(previewScreen(views)).pipe(Effect.catchTag("Cancelled", () => Effect.void));
	}),
).pipe(Command.withDescription("Interactively preview how pnpm-workspace.yaml would change"));
