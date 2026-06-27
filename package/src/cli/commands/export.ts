import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Args, Command, Options } from "@effect/cli";
import { Data, Effect, Option } from "effect";
import { DESCRIPTORS } from "../../descriptors/index.js";
import { freeze } from "../../plugin/freeze.js";
import { evaluatePluginConfig } from "../evaluate.js";
import { applyLocal } from "../local-overlay.js";
import { findConfigFiles, pickConfigCandidate } from "../select-file.js";
import { findWorkspaceFile, parseWorkspace, renderWorkspace } from "../workspace-file.js";
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
 * Export core: evaluate the plugin config, apply the local overlay, freeze it,
 * filter to workspace-yaml fields, overlay onto the existing pnpm-workspace.yaml
 * (or create fresh), and write the result. In preview mode nothing is written.
 *
 * @internal
 */
export function runExport(opts: {
	configFile: string;
	workspacePath?: string;
	preview: boolean;
}): Effect.Effect<{ path: string; rendered: string; written: boolean }, ExportError> {
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
		const effective = applyLocal(config);
		const { base } = yield* freeze(effective as never).pipe(
			Effect.mapError((e) => new ExportError({ message: e.message })),
		);
		const managed: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(base)) {
			if (WORKSPACE_FIELDS.has(k)) managed[k] = v;
		}

		const path = opts.workspacePath ?? findWorkspaceFile(process.cwd()) ?? `${process.cwd()}/pnpm-workspace.yaml`;
		const parsed = existsSync(path) ? parseWorkspace(readFileSync(path, "utf8")) : {};
		const merged = overlayWorkspace(managed, parsed);
		const rendered = renderWorkspace(merged);

		if (opts.preview) return { path, rendered, written: false };
		yield* Effect.try({
			try: () => writeFileSync(path, rendered, "utf8"),
			catch: () => new ExportError({ message: `Cannot write ${path}` }),
		});
		return { path, rendered, written: true };
	});
}

const pathArg = Args.file({ name: "path" }).pipe(Args.optional);
const previewFlag = Options.boolean("preview").pipe(Options.withDefault(false));

/**
 * The "export" command. Materializes the plugin config into pnpm-workspace.yaml.
 * An optional path argument overrides the auto-detected workspace file. --preview
 * prints the rendered YAML to stdout without writing.
 *
 * @internal
 */
export const exportCommand = Command.make("export", { path: pathArg, preview: previewFlag }, ({ path, preview }) =>
	Effect.gen(function* () {
		const matches = yield* findConfigFiles(process.cwd());
		const picked = pickConfigCandidate(matches);
		if (!picked.ok) return yield* Effect.fail(new ExportError({ message: picked.message }));
		const workspacePath = Option.getOrUndefined(path);
		const result = yield* runExport({
			configFile: picked.file,
			...(workspacePath !== undefined ? { workspacePath } : {}),
			preview,
		});
		yield* Effect.sync(() => {
			if (preview) process.stdout.write(`${result.rendered}\n`);
			else process.stdout.write(`Exported to ${result.path}\n`);
		});
	}),
).pipe(Command.withDescription("Export the plugin config into pnpm-workspace.yaml"));
