import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Predicate } from "effect";
import { evaluatePluginConfig } from "./evaluate.js";
import { findWorkspaceFile, parseWorkspace } from "./workspace-file.js";

/** A statically evaluated plugin config plus the workspace file it targets. @internal */
export interface LoadedConfig {
	/** The evaluated `PnpmConfigPlugin(...)` argument. */
	readonly config: Record<string, unknown>;
	/** The export-time `local` block, when declared as an object. */
	readonly localCfg: Record<string, unknown> | undefined;
	/** The pnpm-workspace.yaml path: the override, the nearest one upward from cwd, or cwd's. */
	readonly path: string;
	/** The parsed workspace file, or `{}` when it does not exist yet. */
	readonly parsed: Record<string, unknown>;
}

/**
 * The prologue shared by `export` and `preview`: read and statically evaluate
 * the config file (failing on a missing call or non-literal values), locate
 * the workspace file, and parse it when present. `mkError` wraps each failure
 * message in the command's own error type.
 *
 * @internal
 */
export function loadConfigAndWorkspace<E>(
	opts: { configFile: string; workspacePath?: string },
	mkError: (message: string) => E,
): Effect.Effect<LoadedConfig, E> {
	return Effect.gen(function* () {
		const configSource = yield* Effect.try({
			try: () => readFileSync(opts.configFile, "utf8"),
			catch: () => mkError(`Cannot read ${opts.configFile}`),
		});
		const { config, errors } = evaluatePluginConfig(configSource, opts.configFile);
		if (config === null) {
			return yield* Effect.fail(mkError(`No PnpmConfigPlugin call found in ${opts.configFile}`));
		}
		if (errors.length > 0) {
			return yield* Effect.fail(mkError(`Non-literal config values: ${errors.join("; ")}`));
		}
		const path = opts.workspacePath ?? findWorkspaceFile(process.cwd()) ?? join(process.cwd(), "pnpm-workspace.yaml");
		const parsed = existsSync(path)
			? yield* Effect.try({
					try: () => parseWorkspace(readFileSync(path, "utf8")),
					catch: (e) => mkError(`Cannot read or parse ${path}: ${String(e)}`),
				})
			: {};
		const localCfg = Predicate.isObject(config.local) ? config.local : undefined;
		return { config, localCfg, path, parsed };
	});
}
