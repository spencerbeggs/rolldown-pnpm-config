import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { CliAudience, CliRuntime } from "@effected/cli";
import { Effect } from "effect";
import { WorkingDirectory } from "./cwd.js";
import { rootCommand } from "./root.js";
import { CLI_VERSION } from "./version.js";

/**
 * Assemble and run the CLI. One of the three files allowed to read `process`:
 * the working directory, argv for the build-time log format, and stderr's
 * terminal state are read here and passed down as plain values.
 *
 * `CliRuntime.main` builds the audience, terminal and theme from `env`,
 * decides whether the run may prompt, reports every failure on stderr for the
 * run's audience, and maps the exit code (usage 64, cancel 130, otherwise 1).
 *
 * @internal
 */
export function main(): void {
	const program = CliAudience.run(rootCommand, { version: CLI_VERSION }).pipe(
		Effect.provideService(WorkingDirectory, process.cwd()),
	);
	NodeRuntime.runMain(
		CliRuntime.main(program, {
			platform: NodeServices.layer,
			// A usage error's help belongs beside the error, not in a pipe reading stdout.
			helpOnUsageError: "stderr",
			env: {
				audienceEnvVar: "ROLLDOWN_PNPM_CONFIG_AUDIENCE",
				log: { envVar: "ROLLDOWN_PNPM_CONFIG_LOG_LEVEL", argv: process.argv.slice(2) },
				stderrIsTerminal: Effect.sync(() => process.stderr.isTTY === true),
			},
		}),
	);
}
