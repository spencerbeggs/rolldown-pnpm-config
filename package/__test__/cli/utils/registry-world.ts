import { MemoryFileSystem } from "@effected/memfs";
import { Effect, Layer } from "effect";
import { ChildProcessSpawner } from "effect/process";
import type { RegistryResolver, RegistryResolverOptions } from "../../../src/cli/resolve.js";
import { RegistryResolverLive } from "../../../src/cli/resolve.js";

/**
 * A pnpm workspace at `/repo` with one member, `packages/app`. The ROOT holds
 * the pnpm settings; the member holds none, so a resolver run from the member
 * only sees them if it reads the workspace root, as pnpm does.
 */
export const WORKSPACE_FILES: Record<string, string> = {
	"/repo/package.json": '{ "name": "repo-root", "private": true }\n',
	"/repo/pnpm-workspace.yaml":
		"packages:\n  - packages/*\nminimumReleaseAge: 720\nminimumReleaseAgeExclude:\n  - '@acme/*'\n",
	"/repo/packages/app/package.json": '{ "name": "app", "version": "1.0.0" }\n',
};

/** The member directory every Live-wiring test runs from. */
export const MEMBER_CWD = "/repo/packages/app";

/**
 * A spawner that dies if anything spawns: the gate tests read pnpm's settings
 * from files, so a `pnpm` subprocess here would be a wiring bug.
 */
const NoSpawn = Layer.succeed(
	ChildProcessSpawner.ChildProcessSpawner,
	ChildProcessSpawner.make(() => Effect.die(new Error("no subprocess may be spawned in this test"))),
);

/**
 * The Live `RegistryResolver` over an in-memory filesystem and a spawner that
 * refuses to spawn: no network, no real pnpm config. The environment carries
 * only `HOME` (an empty directory), so no global pnpm `config.yaml` leaks in
 * from the machine running the test.
 */
export function liveResolverWorld(
	files: Record<string, string> = WORKSPACE_FILES,
	options: Partial<RegistryResolverOptions> = {},
): Layer.Layer<RegistryResolver> {
	return RegistryResolverLive({
		cwd: options.cwd ?? MEMBER_CWD,
		env: options.env ?? { HOME: "/home/tester" },
		platform: options.platform ?? "linux",
	}).pipe(Layer.provide(Layer.mergeAll(NoSpawn, MemoryFileSystem.layerWithPath(files))));
}
