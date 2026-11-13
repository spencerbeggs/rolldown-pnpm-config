import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { RegistryResolver, ResolveError } from "../../src/cli/resolve.js";
import { WORKSPACE_FILES, liveResolverWorld } from "./utils/registry-world.js";

const StubOk = Layer.succeed(RegistryResolver, {
	versions: (pkg) => Effect.succeed(pkg === "typescript" ? ["5.9.0", "5.9.3"] : []),
	times: () => Effect.succeed({}),
	peerDependencies: () => Effect.succeed({}),
	pnpmReleaseAge: () => Effect.succeed(null),
});

describe("RegistryResolver (contract)", () => {
	it.effect("returns the versions for a package", () =>
		Effect.gen(function* () {
			const out = yield* Effect.gen(function* () {
				const r = yield* RegistryResolver;
				return yield* r.versions("typescript");
			}).pipe(Effect.provide(StubOk));
			expect(out).toEqual(["5.9.0", "5.9.3"]);
		}),
	);

	it("ResolveError carries the package name", () => {
		const err = new ResolveError({ pkg: "x", message: "boom" });
		expect(err.pkg).toBe("x");
	});
});

/** Run `f` against one Live resolver built over the in-memory world. */
const withResolver = <A, E>(
	f: (r: (typeof RegistryResolver)["Service"]) => Effect.Effect<A, E>,
	world = liveResolverWorld(),
) => Effect.flatMap(RegistryResolver, f).pipe(Effect.provide(world));

describe("RegistryResolverLive release-age gate (PnpmSettings)", () => {
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

describe("RegistryResolverLive registry reads (NpmRegistry)", () => {
	it.effect("reads versions from the registry the package routes to", () =>
		Effect.gen(function* () {
			expect(yield* withResolver((r) => r.versions("typescript"))).toEqual(["5.9.0", "5.9.3"]);
		}),
	);

	it.effect("routes a scoped package through the root .npmrc's scoped registry, from a member", () =>
		Effect.gen(function* () {
			expect(yield* withResolver((r) => r.versions("@acme/kit"))).toEqual(["1.0.0"]);
			expect(yield* withResolver((r) => r.peerDependencies("@acme/kit", "1.0.0"))).toEqual({ effect: "^4.0.0" });
		}),
	);

	it.effect("misses the scoped package without the workspace root's .npmrc (control)", () =>
		Effect.gen(function* () {
			const { "/repo/.npmrc": _npmrc, ...noNpmrc } = WORKSPACE_FILES;
			const err = yield* withResolver((r) => Effect.flip(r.versions("@acme/kit")), liveResolverWorld(noNpmrc));
			expect(err).toBeInstanceOf(ResolveError);
			expect(err.pkg).toBe("@acme/kit");
		}),
	);

	it.effect("routes reads to the registry pnpm-workspace.yaml names, as pnpm 12 does", () =>
		Effect.gen(function* () {
			const files = {
				...WORKSPACE_FILES,
				"/repo/pnpm-workspace.yaml": "packages:\n  - packages/*\nregistry: https://mirror.example.test/\n",
			};
			const seed = {
				registries: {
					"https://mirror.example.test/": { typescript: { "6.0.0": { publishedAt: "2025-04-01T00:00:00.000Z" } } },
				},
			};
			expect(yield* withResolver((r) => r.versions("typescript"), liveResolverWorld(files, {}, seed))).toEqual([
				"6.0.0",
			]);
			// Control: without the workspace-file registry the public registry answers.
			expect(yield* withResolver((r) => r.versions("typescript"))).toEqual(["5.9.0", "5.9.3"]);
		}),
	);

	it.effect("fails reads typed, scoped to the configuration, on a registry URL pnpm refuses", () =>
		Effect.gen(function* () {
			const files = {
				...WORKSPACE_FILES,
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the literal placeholder pnpm refuses in a registry URL.
				"/repo/pnpm-workspace.yaml": "packages:\n  - packages/*\nregistry: https://${REGISTRY_HOST}/\n",
			};
			const err = yield* withResolver((r) => Effect.flip(r.versions("typescript")), liveResolverWorld(files));
			expect(err.scope).toBe("config");
		}),
	);

	it.effect("reads publish times as version to ISO time", () =>
		Effect.gen(function* () {
			expect(yield* withResolver((r) => r.times("typescript"))).toEqual({
				"5.9.0": "2025-01-01T00:00:00.000Z",
				"5.9.3": "2025-03-01T00:00:00.000Z",
			});
		}),
	);

	it.effect("fails times with its own cause when the packument lists no publish times", () =>
		Effect.gen(function* () {
			const seed = { registries: { "https://registry.npmjs.org": { typescript: { "5.9.0": {} } } } };
			const world = liveResolverWorld(WORKSPACE_FILES, {}, seed);
			expect(yield* withResolver((r) => r.versions("typescript"), world)).toEqual(["5.9.0"]);
			const err = yield* withResolver((r) => Effect.flip(r.times("typescript")), world);
			expect(err.message).toBe("publish times unavailable for typescript: the registry lists none");
		}),
	);

	it.effect("reads a version's peers, {} for one that declares none or is unpublished", () =>
		Effect.gen(function* () {
			expect(yield* withResolver((r) => r.peerDependencies("typescript", "5.9.3"))).toEqual({ "@types/node": "*" });
			expect(yield* withResolver((r) => r.peerDependencies("typescript", "5.9.0"))).toEqual({});
			expect(yield* withResolver((r) => r.peerDependencies("typescript", "9.9.9"))).toEqual({});
		}),
	);

	it.effect("fails versions typed, naming the package, for one the registry does not know", () =>
		Effect.gen(function* () {
			const err = yield* withResolver((r) => Effect.flip(r.versions("no-such-pkg")));
			expect(err).toBeInstanceOf(ResolveError);
			expect(err.pkg).toBe("no-such-pkg");
			expect(err.message).toContain("no-such-pkg");
		}),
	);

	it.effect("fails reads typed (not a defect, not at layer construction) on an unreadable npmrc", () =>
		Effect.gen(function* () {
			// `.npmrc` as a directory: reading it fails EISDIR, which npm's loader reports as a read failure.
			const { "/repo/.npmrc": _npmrc, ...rest } = WORKSPACE_FILES;
			const world = liveResolverWorld({ ...rest, "/repo/.npmrc/nested": "" });
			const err = yield* withResolver((r) => Effect.flip(r.versions("typescript")), world);
			expect(err).toBeInstanceOf(ResolveError);
			expect(err.message).toContain(".npmrc");
			expect(err.scope).toBe("config");
			// The release-age gate reads pnpm's settings, not the npmrc, so it still answers.
			expect(yield* withResolver((r) => r.pnpmReleaseAge(), world)).toEqual({ ageMinutes: 720, exclude: ["@acme/*"] });
		}),
	);
});
