import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { CliEnv, CliExit, CliLinks } from "@effected/cli-kit";
import type { CliUiTestSession } from "@effected/cli-kit/ui/testing";
import { CliUiTest } from "@effected/cli-kit/ui/testing";
import { Cause, Effect, Exit, Fiber, Layer, Option } from "effect";
import { Command } from "effect/cli";
import { CheckFailedError, UpgradeError, upgradeCommand } from "../../src/cli/commands/upgrade.js";
import { WorkingDirectory } from "../../src/cli/cwd.js";
import { stubResolverLayer } from "./utils/stub-resolver.js";
import { writeTmpWorkspaceConfig } from "./utils/tmp-workspace.js";

const BAD = fileURLToPath(new URL("./fixtures/workspace-bad-changeset/", import.meta.url));
const CLEAN = fileURLToPath(new URL("./fixtures/workspace-next/", import.meta.url));

// `@bump/alpha` is at 1.0.0 with a valid minor changeset beside a malformed
// one, so its next version is 1.1.0 and `^1.1.0` is in sync.
const workspaceConfig = (pkg: string, range: string) => `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { effected: { packages: { "${pkg}": { range: "${range}", source: "workspace" } } } },
});
`;

const registryConfig = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { silk: { packages: { typescript: "^5.9.3" } } },
});
`;

const resolver = stubResolverLayer({ versions: { typescript: ["5.9.3"] } });

const presentation = Layer.mergeAll(
	CliEnv.layerTest({ tty: false, columns: 100, audience: "agent" }),
	CliLinks.layerTest("off"),
);

/** `rolldown-pnpm-config upgrade <args>` under a non-interactive session; resolves to its exit. */
const upgrade = (session: CliUiTestSession, args: ReadonlyArray<string>) =>
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

const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
	Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined;

const checkFailure = (exit: Exit.Exit<unknown, unknown>): CheckFailedError | undefined => {
	const error = failureOf(exit);
	return error instanceof CheckFailedError ? error : undefined;
};

const upgradeFailure = (exit: Exit.Exit<unknown, unknown>): UpgradeError | undefined => {
	const error = failureOf(exit);
	return error instanceof UpgradeError ? error : undefined;
};

describe("a malformed pending changeset", () => {
	it.effect("without --yes or --check, warns on stderr, names the file, and still succeeds", () =>
		Effect.gen(function* () {
			const file = writeTmpWorkspaceConfig(BAD, workspaceConfig("@bump/alpha", "^1.0.0"));
			const session = yield* CliUiTest.session({ color: "none", interactive: false });
			const exit = yield* upgrade(session, [file]);
			expect(Exit.isSuccess(exit)).toBe(true);
			const stderr = yield* session.stderr;
			expect(stderr).toContain("Skipped 1 malformed changeset");
			expect(stderr).toContain(".changeset/bad.md");
			expect(yield* session.stdout).not.toContain("malformed changeset");
		}),
	);

	it.effect("--yes fails with the changeset family and writes nothing", () =>
		Effect.gen(function* () {
			const source = workspaceConfig("@bump/alpha", "^1.0.0");
			const file = writeTmpWorkspaceConfig(BAD, source);
			const session = yield* CliUiTest.session({ color: "none", interactive: false });
			const exit = yield* upgrade(session, ["--yes", file]);
			const failure = upgradeFailure(exit);
			expect(failure?.kind).toBe("changeset");
			expect(failure?.message).toContain(".changeset/bad.md");
			expect(readFileSync(file, "utf8")).toBe(source);
			// The failure report carries the list; the finalizer must not repeat it as a warning.
			expect(yield* session.stderr).not.toContain("malformed changeset");
		}),
	);

	it.effect("--yes --format json prints an error document with error.kind changeset", () =>
		Effect.gen(function* () {
			const file = writeTmpWorkspaceConfig(BAD, workspaceConfig("@bump/alpha", "^1.0.0"));
			const session = yield* CliUiTest.session({ color: "none", interactive: false });
			const exit = yield* upgrade(session, ["--yes", "--format", "json", file]);
			expect(upgradeFailure(exit)?.kind).toBe("changeset");
			const doc = JSON.parse((yield* session.stdout).trim());
			expect(doc).toMatchObject({ command: "upgrade", applied: false, error: { kind: "changeset" } });
		}),
	);

	it.effect("--check fails with the changeset family even when nothing drifted", () =>
		Effect.gen(function* () {
			const file = writeTmpWorkspaceConfig(BAD, workspaceConfig("@bump/alpha", "^1.1.0"));
			const session = yield* CliUiTest.session({ color: "none", interactive: false });
			const exit = yield* upgrade(session, ["--check", file]);
			const failure = checkFailure(exit);
			expect(failure?.kind).toBe("changeset");
			expect(failure?.message).toContain(".changeset/bad.md");
			// The failure report carries the list; the finalizer must not repeat it as a warning.
			expect(yield* session.stderr).not.toContain("malformed changeset");
		}),
	);

	it.effect("--check --format json keeps one document on stdout, with error.kind changeset", () =>
		Effect.gen(function* () {
			const file = writeTmpWorkspaceConfig(BAD, workspaceConfig("@bump/alpha", "^1.1.0"));
			const session = yield* CliUiTest.session({ color: "none", interactive: false });
			const exit = yield* upgrade(session, ["--check", "--format", "json", file]);
			expect(checkFailure(exit)?.kind).toBe("changeset");
			const doc = JSON.parse((yield* session.stdout).trim());
			expect(doc).toMatchObject({ command: "check", inSync: false, error: { kind: "changeset" } });
		}),
	);

	it.effect("control: --check passes when the workspace has no malformed changeset", () =>
		Effect.gen(function* () {
			const file = writeTmpWorkspaceConfig(CLEAN, workspaceConfig("@fix/bumped", "^0.3.0"));
			const session = yield* CliUiTest.session({ color: "none", interactive: false });
			const exit = yield* upgrade(session, ["--check", file]);
			expect(Exit.isSuccess(exit)).toBe(true);
			expect(yield* session.stderr).not.toContain("malformed changeset");
		}),
	);

	it.effect("stays quiet when no entry resolves from the workspace", () =>
		Effect.gen(function* () {
			const file = writeTmpWorkspaceConfig(BAD, registryConfig);
			const session = yield* CliUiTest.session({ color: "none", interactive: false });
			const exit = yield* upgrade(session, ["--check", file]);
			expect(Exit.isSuccess(exit)).toBe(true);
			expect(yield* session.stderr).not.toContain("malformed changeset");
		}),
	);
});
