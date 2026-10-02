import { CliAudience } from "@effected/cli";
import { Command } from "effect/cli";
import { exportCommand } from "./commands/export.js";
import { previewCommand } from "./commands/preview.js";
import { upgradeCommand } from "./commands/upgrade.js";

/**
 * The `rolldown-pnpm-config` command tree, with the audience flags
 * (`--audience`, `--human`, `--agent`, `--ci`) shared from the root so every
 * subcommand accepts them.
 *
 * @internal
 */
export const rootCommand = Command.make("rolldown-pnpm-config").pipe(
	Command.withSharedFlags(CliAudience.flags()),
	Command.withSubcommands([upgradeCommand, exportCommand, previewCommand]),
);
