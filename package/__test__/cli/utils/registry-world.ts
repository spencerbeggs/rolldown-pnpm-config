import { MemoryFileSystem } from "@effected/memfs";
import type { RegistrySeed } from "@effected/npm";
import { NpmRegistry } from "@effected/npm";
import type { Layer } from "effect";
import { Layer as L } from "effect";
import type { RegistryResolver, RegistryResolverOptions } from "../../../src/cli/resolve.js";
import { RegistryResolverLive } from "../../../src/cli/resolve.js";

/**
 * A pnpm workspace at `/repo` with one member, `packages/app`. The ROOT holds
 * the pnpm settings and the npmrc; the member holds neither, so a resolver run
 * from the member only sees them if it reads the workspace root, as pnpm does.
 */
export const WORKSPACE_FILES: Record<string, string> = {
	"/repo/package.json": '{ "name": "repo-root", "private": true }\n',
	"/repo/pnpm-workspace.yaml":
		"packages:\n  - packages/*\nminimumReleaseAge: 720\nminimumReleaseAgeExclude:\n  - '@acme/*'\n",
	"/repo/.npmrc": "@acme:registry=https://npm.acme.test/\n",
	"/repo/packages/app/package.json": '{ "name": "app", "version": "1.0.0" }\n',
};

/** The member directory every Live-wiring test runs from. */
export const MEMBER_CWD = "/repo/packages/app";

/** The scoped registry `/repo/.npmrc` routes `@acme/*` to. */
export const ACME_REGISTRY = "https://npm.acme.test/";

/**
 * Two registries: `typescript` on the public one, `@acme/kit` on the scoped one
 * only. A read routed to the wrong registry finds nothing.
 */
export const REGISTRY_SEED: RegistrySeed = {
	registries: {
		"https://registry.npmjs.org": {
			typescript: {
				"5.9.0": { publishedAt: "2025-01-01T00:00:00.000Z" },
				"5.9.3": { publishedAt: "2025-03-01T00:00:00.000Z", peerDependencies: { "@types/node": "*" } },
			},
		},
		[ACME_REGISTRY]: {
			"@acme/kit": { "1.0.0": { publishedAt: "2025-02-01T00:00:00.000Z", peerDependencies: { effect: "^4.0.0" } } },
		},
	},
};

/**
 * The Live `RegistryResolver` over an in-memory filesystem and a seeded
 * registry: no network, no real pnpm or npm config. The npmrc loading and the
 * per-package routing stay real. The environment carries only `HOME` (an
 * empty directory), so no user npmrc or global pnpm `config.yaml` leaks in
 * from the machine running the test.
 */
export function liveResolverWorld(
	files: Record<string, string> = WORKSPACE_FILES,
	options: Partial<RegistryResolverOptions> = {},
	seed: RegistrySeed = REGISTRY_SEED,
): Layer.Layer<RegistryResolver> {
	const registry = NpmRegistry.layerSeeded(seed);
	return RegistryResolverLive(
		{
			cwd: options.cwd ?? MEMBER_CWD,
			env: options.env ?? { HOME: "/home/tester" },
			platform: options.platform ?? "linux",
		},
		() => registry,
	).pipe(L.provide(MemoryFileSystem.layerWithPath(files)));
}
