import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { CliAudience, CliRuntime } from "@effected/cli";
import { Effect } from "effect";
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
 * The registry resolver (`pnpm view`, spawned through the platform) is
 * provided here, at the edge, so a test drives the same command tree against
 * a stub resolver.
 *
 * `CliRuntime.main` builds the audience, terminal and theme from `env`,
 * decides whether the run may prompt, reports every failure on stderr for the
 * run's audience, and maps the exit code (usage 64, cancel 130, `EXIT_CODES`
 * by tag, otherwise 1).
 *
 * @internal
 */
export function main(): void {
	const program = CliAudience.run(rootCommand, { version: CLI_VERSION }).pipe(
		Effect.provideService(WorkingDirectory, process.cwd()),
		Effect.provide(RegistryResolverLive),
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
