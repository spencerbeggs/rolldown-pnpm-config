import { NodeServices } from "@effect/platform-node";
import { CliEnv, CliExit, CliLinks } from "@effected/cli-kit";
import type { CliUiTestSession } from "@effected/cli-kit/ui/testing";
import { Cause, Effect, Exit, Fiber, Layer, Option } from "effect";
import { Command } from "effect/cli";
import { upgradeCommand } from "../../../src/cli/commands/upgrade.js";
import { WorkingDirectory } from "../../../src/cli/cwd.js";
import type { RegistryResolver } from "../../../src/cli/resolve.js";

const presentation = Layer.mergeAll(
	CliEnv.layerTest({ tty: false, columns: 100, audience: "agent" }),
	CliLinks.layerTest("off"),
);

/**
 * Drive `rolldown-pnpm-config upgrade <args>` as a whole command under a test
 * session and a stubbed registry; resolves to the command's exit.
 */
export const runUpgradeCommand = (
	session: CliUiTestSession,
	resolver: Layer.Layer<RegistryResolver>,
	args: ReadonlyArray<string>,
) =>
	Command.runWith(upgradeCommand, { version: "0.0.0" })(args).pipe(
		Effect.provide(session.layer),
		Effect.provide(presentation),
		Effect.provide(resolver),
		Effect.provide(CliExit.layer),
		Effect.provideService(WorkingDirectory, "/"),
		Effect.provide(NodeServices.layer),
		Effect.forkScoped,
		Effect.flatMap(Fiber.await),
	);

/** The typed failure of a failed Exit, or undefined. */
export const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
	Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined;
