import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { CliAudience, CliRuntime } from "@effected/cli-kit";
import { NpmRegistry } from "@effected/npm";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { WorkingDirectory } from "./cwd.js";
import { EXIT_CODES } from "./exit-codes.js";
import { RegistryResolverLive } from "./resolve.js";
import { rootCommand } from "./root.js";
import { CLI_VERSION } from "./version.js";

/**
 * Assemble and run the CLI. One of the three files allowed to read `process`:
 * the working directory and argv for the build-time log format are read here
 * and passed down as plain values. Stderr's terminal state is not: the
 * platform's `Stdio` (in `NodeServices.layer`) answers it, which is where the
 * kit reads it from when `env.stderrIsTerminal` is omitted.
 *
 * The registry resolver is provided here, at the edge, so a test drives the
 * same command tree against a stub resolver. It reads the registry over core's
 * fetch-backed `HttpClient` (`NpmRegistry.layer`), its npmrc and pnpm settings
 * from `process.cwd()` / `process.env` / `process.platform`, and the platform's
 * `FileSystem` and `Path` (from `NodeServices.layer`, provided by `main`).
 *
 * `CliRuntime.main` builds the audience, terminal and theme from `env`,
 * decides whether the run may prompt, reports every failure on stderr for the
 * run's audience, and maps the exit code (usage 64, cancel 130, `EXIT_CODES`
 * by tag, otherwise 1).
 *
 * @internal
 */
export function main(): void {
	const cwd = process.cwd();
	const resolverLayer = RegistryResolverLive({ cwd, env: process.env, platform: process.platform }).pipe(
		Layer.provide(NpmRegistry.layer),
		Layer.provide(FetchHttpClient.layer),
	);
	const program = CliAudience.run(rootCommand, { version: CLI_VERSION }).pipe(
		Effect.provideService(WorkingDirectory, cwd),
		Effect.provide(resolverLayer),
	);
	NodeRuntime.runMain(
		CliRuntime.main(program, {
			platform: NodeServices.layer,
			// A usage error's help belongs beside the error, not in a pipe reading stdout.
			helpOnUsageError: "stderr",
			// Exit codes by failure tag (the command's own usage error → 64).
			exitCodes: EXIT_CODES,
			env: {
				audienceEnvVar: "ROLLDOWN_PNPM_CONFIG_AUDIENCE",
				log: { envVar: "ROLLDOWN_PNPM_CONFIG_LOG_LEVEL", argv: process.argv.slice(2) },
			},
		}),
	);
}
