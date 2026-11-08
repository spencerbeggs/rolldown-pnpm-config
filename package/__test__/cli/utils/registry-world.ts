import { MemoryFileSystem } from "@effected/memfs";
import type { RegistrySeed } from "@effected/npm";
import { NpmRegistry } from "@effected/npm";
import { Layer } from "effect";
import type { RegistryResolver, RegistryResolverOptions } from "../../../src/cli/resolve.js";
import { RegistryResolverLive } from "../../../src/cli/resolve.js";

/** The scoped registry the root `.npmrc` of {@link WORKSPACE_FILES} routes `@acme/*` to. */
export const ACME_REGISTRY = "https://npm.acme.test/";

/** The public registry, as `NpmConfig` names it when no `registry` setting is configured. */
export const PUBLIC_REGISTRY = "https://registry.npmjs.org";

/**
 * A pnpm workspace at `/repo` with one member, `packages/app`. The ROOT holds
 * the `.npmrc` (a scoped registry) and the pnpm settings; the member holds
 * neither — so a resolver run from the member only sees them if it reads the
 * workspace root, as pnpm does.
 */
export const WORKSPACE_FILES: Record<string, string> = {
	"/repo/package.json": '{ "name": "repo-root", "private": true }\n',
	"/repo/pnpm-workspace.yaml":
		"packages:\n  - packages/*\nminimumReleaseAge: 720\nminimumReleaseAgeExclude:\n  - '@acme/*'\n",
	"/repo/.npmrc": `@acme:registry=${ACME_REGISTRY}\n`,
	"/repo/packages/app/package.json": '{ "name": "app", "version": "1.0.0" }\n',
};

/** The member directory every Live-wiring test runs from. */
export const MEMBER_CWD = "/repo/packages/app";

/** A registry world: `typescript` on the public registry, `@acme/kit` only on the acme registry. */
export const REGISTRY_SEED: RegistrySeed = {
	registries: {
		[PUBLIC_REGISTRY]: {
			typescript: {
				"5.9.0": { publishedAt: "2025-08-01T00:00:00.000Z" },
				"5.9.3": { publishedAt: "2025-10-01T12:30:00.000Z", peerDependencies: {} },
			},
			vitest: {
				"4.1.12": { peerDependencies: { vite: "^7.0.0", "@types/node": "*" } },
			},
		},
		[ACME_REGISTRY]: {
			"@acme/kit": {
				"2.0.0": { publishedAt: "2026-01-01T00:00:00.000Z" },
			},
		},
	},
};

/**
 * The Live `RegistryResolver` over a seeded in-memory registry and an
 * in-memory filesystem: no network, no real npmrc, no real pnpm config. The
 * environment carries only `HOME` (an empty directory), so no user npmrc and
 * no global pnpm `config.yaml` leak in from the machine running the test.
 */
export function liveResolverWorld(
	files: Record<string, string> = WORKSPACE_FILES,
	options: Partial<RegistryResolverOptions> = {},
): Layer.Layer<RegistryResolver> {
	return RegistryResolverLive({
		cwd: options.cwd ?? MEMBER_CWD,
		env: options.env ?? { HOME: "/home/tester" },
		platform: options.platform ?? "linux",
	}).pipe(Layer.provide(Layer.mergeAll(NpmRegistry.layerSeeded(REGISTRY_SEED), MemoryFileSystem.layerWithPath(files))));
}
