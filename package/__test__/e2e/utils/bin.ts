import { cpSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { CliTest } from "@effected/cli/testing";
import { Effect } from "effect";

/** The dev build of the bin (the global setup builds it before any test runs). */
export const BIN = fileURLToPath(new URL("../../../dist/dev/pkg/bin/rolldown-pnpm-config.js", import.meta.url));

/** The package's own version, which the built bin's `--version` must report. */
export const VERSION: string = (
	JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version: string }
).version;

const FIXTURE = fileURLToPath(new URL("../fixtures/workspace/", import.meta.url));

/** A fresh copy of the fixture workspace (one config file and a pnpm-workspace.yaml), so a run can never touch the committed fixture. */
export function workspaceCopy(): string {
	// The real path: the child reports its cwd resolved (/private/var on macOS, not /var).
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "rpc-e2e-")));
	cpSync(FIXTURE, dir, { recursive: true });
	return dir;
}

/**
 * Spawn the built bin in a hermetic sandbox (fresh HOME and XDG dirs,
 * `NO_COLOR=1`, nothing inherited from the host but PATH) and read back its
 * exit code and both streams as data.
 */
export function runBin(
	args: ReadonlyArray<string>,
	options: { readonly cwd?: string; readonly env?: Readonly<Record<string, string>> } = {},
) {
	return Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const sandbox = yield* CliTest.sandbox({ path: process.env.PATH ?? "" });
				return yield* CliTest.run(BIN, args, {
					sandbox,
					execPath: process.execPath,
					cwd: options.cwd ?? sandbox.root,
					...(options.env !== undefined ? { env: options.env } : {}),
				});
			}),
		).pipe(Effect.provide(NodeServices.layer)),
	);
}
