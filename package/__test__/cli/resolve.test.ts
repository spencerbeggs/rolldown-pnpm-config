import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { RegistryResolver, ResolveError } from "../../src/cli/resolve.js";
import { WORKSPACE_FILES, liveResolverWorld } from "./utils/registry-world.js";

/** Run `f` against one Live resolver built over the in-memory world. */
const withResolver = <A, E>(
	f: (r: (typeof RegistryResolver)["Service"]) => Effect.Effect<A, E>,
	world = liveResolverWorld(),
) => Effect.flatMap(RegistryResolver, f).pipe(Effect.provide(world));

describe("RegistryResolverLive (NpmRegistry + NpmConfig + PnpmSettings)", () => {
	it.effect("lists every published version of a package", () =>
		Effect.gen(function* () {
			const versions = yield* withResolver((r) => r.versions("typescript"));
			expect([...versions].sort()).toEqual(["5.9.0", "5.9.3"]);
		}),
	);

	it.effect("fails with ResolveError naming the package when the registry does not know it", () =>
		Effect.gen(function* () {
			const err = yield* withResolver((r) => Effect.flip(r.versions("typescirpt")));
			expect(err).toBeInstanceOf(ResolveError);
			expect(err.pkg).toBe("typescirpt");
		}),
	);

	it.effect("routes a scoped package through the workspace-ROOT .npmrc, from a member directory", () =>
		Effect.gen(function* () {
			// @acme/kit exists ONLY on the acme registry; the routing lives only in
			// /repo/.npmrc, and the run starts in /repo/packages/app.
			const versions = yield* withResolver((r) => r.versions("@acme/kit"));
			expect(versions).toEqual(["2.0.0"]);
		}),
	);

	it.effect("does not find a scoped package when no npmrc routes its scope (control)", () =>
		Effect.gen(function* () {
			const { "/repo/.npmrc": _routing, ...withoutNpmrc } = WORKSPACE_FILES;
			const err = yield* withResolver((r) => Effect.flip(r.versions("@acme/kit")), liveResolverWorld(withoutNpmrc));
			expect(err._tag).toBe("ResolveError");
		}),
	);

	it.effect("maps publish times to version → ISO string", () =>
		Effect.gen(function* () {
			const times = yield* withResolver((r) => r.times("typescript"));
			expect(times).toEqual({
				"5.9.0": "2025-08-01T00:00:00.000Z",
				"5.9.3": "2025-10-01T12:30:00.000Z",
			});
		}),
	);

	it.effect("reads one version's peerDependencies", () =>
		Effect.gen(function* () {
			const peers = yield* withResolver((r) => r.peerDependencies("vitest", "4.1.12"));
			expect(peers).toEqual({ vite: "^7.0.0", "@types/node": "*" });
		}),
	);

	it.effect("reads no peers as {} — both a version without peers and an unknown version", () =>
		Effect.gen(function* () {
			expect(yield* withResolver((r) => r.peerDependencies("typescript", "5.9.0"))).toEqual({});
			expect(yield* withResolver((r) => r.peerDependencies("typescript", "9.9.9"))).toEqual({});
		}),
	);

	it.effect("reads pnpm's release-age gate from the workspace pnpm-workspace.yaml", () =>
		Effect.gen(function* () {
			const gate = yield* withResolver((r) => r.pnpmReleaseAge());
			expect(gate).toEqual({ ageMinutes: 720, exclude: ["@acme/*"] });
		}),
	);

	it.effect("lets a pnpm_config_* environment variable override the workspace file", () =>
		Effect.gen(function* () {
			const world = liveResolverWorld(WORKSPACE_FILES, {
				env: { HOME: "/home/tester", pnpm_config_minimum_release_age: "60" },
			});
			const gate = yield* withResolver((r) => r.pnpmReleaseAge(), world);
			expect(gate?.ageMinutes).toBe(60);
		}),
	);

	it.effect("contributes no gate when pnpm sets neither setting (unset age is absent, not 0)", () =>
		Effect.gen(function* () {
			const world = liveResolverWorld({
				...WORKSPACE_FILES,
				"/repo/pnpm-workspace.yaml": "packages:\n  - packages/*\n",
			});
			const gate = yield* withResolver((r) => r.pnpmReleaseAge(), world);
			expect(gate).toBeNull();
		}),
	);

	it.effect("fails pnpmReleaseAge typed (not a defect) on a malformed pnpm-workspace.yaml", () =>
		Effect.gen(function* () {
			const world = liveResolverWorld({ ...WORKSPACE_FILES, "/repo/pnpm-workspace.yaml": "- just\n- a list\n" });
			const err = yield* withResolver((r) => Effect.flip(r.pnpmReleaseAge()), world);
			expect(err._tag).toBe("ResolveError");
		}),
	);
});
