import { Fmt } from "@effected/cli";
import { Effect, FileSystem, Predicate } from "effect";
import { evaluatePluginConfig } from "./evaluate.js";
import { parseWorkspace } from "./workspace-file.js";

/** A statically evaluated plugin config plus the workspace file it targets. @internal */
export interface LoadedConfig {
	/** The evaluated `PnpmConfigPlugin(...)` argument. */
	readonly config: Record<string, unknown>;
	/** The export-time `local` block, when declared as an object. */
	readonly localCfg: Record<string, unknown> | undefined;
	/** The pnpm-workspace.yaml path the caller resolved (see `resolveWorkspacePath`). */
	readonly path: string;
	/** The parsed workspace file, or `{}` when it does not exist yet. */
	readonly parsed: Record<string, unknown>;
	/** The workspace file's raw text, or `""` when it does not exist yet. */
	readonly source: string;
}

/**
 * The prologue shared by `export` and `preview`: read and statically evaluate
 * the config file (failing on a missing call or non-literal values), and
 * parse the workspace file when present. `mkError` wraps each failure
 * message in the command's own error type.
 *
 * IO goes through the platform `FileSystem`. Only a workspace file that is
 * NOT FOUND reads as absent (`fs.exists` maps `NotFound` to `false`); an
 * existence check that fails for any other reason (EACCES, ENOTDIR, EIO) is a
 * `Cannot read or parse` failure, never a silent "create it fresh".
 *
 * @internal
 */
export function loadConfigAndWorkspace<E>(
	opts: { configFile: string; workspacePath: string },
	mkError: (message: string) => E,
): Effect.Effect<LoadedConfig, E, FileSystem.FileSystem> {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const configSource = yield* fs
			.readFileString(opts.configFile)
			.pipe(Effect.mapError(() => mkError(`Cannot read ${opts.configFile}`)));
		const { config, errors } = evaluatePluginConfig(configSource, opts.configFile);
		if (config === null) {
			return yield* Effect.fail(mkError(`No PnpmConfigPlugin call found in ${opts.configFile}`));
		}
		if (errors.length > 0) {
			return yield* Effect.fail(mkError(`Non-literal config values: ${errors.join("; ")}`));
		}
		const path = opts.workspacePath;
		const cannotRead = (e: unknown) => mkError(`Cannot read or parse ${path}: ${Fmt.errorText(e)}`);
		const present = yield* fs.exists(path).pipe(Effect.mapError(cannotRead));
		const source = present ? yield* fs.readFileString(path).pipe(Effect.mapError(cannotRead)) : "";
		const parsed = present ? yield* Effect.try({ try: () => parseWorkspace(source), catch: cannotRead }) : {};
		const localCfg = Predicate.isObject(config.local) ? config.local : undefined;
		return { config, localCfg, path, parsed, source };
	});
}
