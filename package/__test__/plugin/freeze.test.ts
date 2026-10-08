import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { freeze } from "../../src/plugin/freeze.js";

describe("freeze", () => {
	it.effect("produces base + manifest from a valid config", () =>
		Effect.gen(function* () {
			const out = yield* freeze({ name: "@test/cfg", catalogs: { silk: { packages: { a: "1.0.0" } } } });
			expect(out.base.catalogs).toEqual({ silk: { a: "1.0.0" } });
			expect(out.manifest.catalogs).toEqual({ strategy: "catalogs", enforcement: "warn" });
		}),
	);

	it.effect("derives peerDependencyRules.allowedVersions from a catalog directive and strips it", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: {
					effect: {
						packages: {
							effect: { range: "4.0.0-beta.99", peer: "4.0.0-beta.99", strategy: "lock" },
							"@effect/platform-node": { range: "4.0.0-beta.99", peer: "4.0.0-beta.99", strategy: "lock" },
						},
					},
				},
				peerDependencyRules: { allowedVersionsFromCatalogs: { catalog: "effect", peer: "effect" } },
			});
			// The directive is resolved into allowedVersions and removed (schema-clean value).
			expect(base.peerDependencyRules).toEqual({
				allowedVersions: { "@effect/platform-node@4.0.0-beta.99>effect": "4.0.0-beta.99" },
			});
		}),
	);

	it.effect("applies a prefix transform to the derived peer value", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: {
					effect: {
						packages: {
							effect: "4.0.0-beta.99",
							"@effect/platform-node": "4.0.0-beta.99",
						},
					},
				},
				peerDependencyRules: { allowedVersionsFromCatalogs: { catalog: "effect", peer: "effect", prefix: "^" } },
			});
			expect(base.peerDependencyRules).toEqual({
				allowedVersions: { "@effect/platform-node@4.0.0-beta.99>effect": "^4.0.0-beta.99" },
			});
		}),
	);

	it.effect("fails with a ConfigError when the directive names an undeclared catalog", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(
				freeze({
					name: "@test/cfg",
					catalogs: { effect: { packages: { effect: "4.0.0-beta.99" } } },
					peerDependencyRules: { allowedVersionsFromCatalogs: { catalog: "nope", peer: "effect" } },
				}),
			);
			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("fails with ConfigError when catalogs are malformed", () =>
		Effect.gen(function* () {
			const bad = { name: "@test/cfg", catalogs: { silk: { packages: { a: 123 } } } } as unknown as Parameters<
				typeof freeze
			>[0];
			const exit = yield* Effect.exit(freeze(bad));
			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				const err = exit.cause;
				expect(String(err)).toContain("ConfigError");
			}
		}),
	);

	it.effect("validates + freezes every declared field with its strategy and enforcement", () =>
		Effect.gen(function* () {
			const out = yield* freeze({
				name: "@test/cfg",
				catalogs: { silk: { packages: { a: "1.0.0" } } },
				overrides: { "tar@<1": ">=1" },
				strictDepBuilds: true,
				minimumReleaseAge: { value: 1440, enforcement: "warn" },
				publicHoistPattern: { value: ["@types/*"], excludeByRepo: { "my-repo": ["@x/cli"] } },
				allowBuilds: { esbuild: true },
				supportedArchitectures: { os: ["linux"] },
				confirmModulesPurge: false,
			});
			expect(out.base.overrides).toEqual({ "tar@<1": ">=1" });
			expect(out.base.minimumReleaseAge).toBe(1440);
			expect(out.base.publicHoistPattern).toEqual(["@types/*"]);
			expect(out.base.confirmModulesPurge).toBe(false);
			expect(out.manifest.minimumReleaseAge).toEqual({ strategy: "securityMin", enforcement: "warn" });
			expect(out.manifest.strictDepBuilds).toEqual({ strategy: "securityFlag", enforcement: "warn" });
			expect(out.manifest.publicHoistPattern).toEqual({
				strategy: "arrayUnion",
				enforcement: "absent",
				options: { excludeByRepo: { "my-repo": ["@x/cli"] } },
			});
		}),
	);

	it.effect("treats a record field containing a `value` key as data, not the wrapped form", () =>
		Effect.gen(function* () {
			const out = yield* freeze({
				name: "@test/cfg",
				catalogs: { silk: { packages: { a: "1.0.0" } } },
				overrides: { value: ">=1", lodash: ">=4" },
			});
			expect(out.base.overrides).toEqual({ value: ">=1", lodash: ">=4" });
			expect(out.manifest.overrides).toEqual({ strategy: "overrides", enforcement: "warn" });
		}),
	);

	it.effect("fails with ConfigError naming the field when a field's value shape is wrong", () =>
		Effect.gen(function* () {
			const bad = {
				name: "@test/cfg",
				catalogs: { silk: { packages: { a: "1.0.0" } } },
				minimumReleaseAge: "soon" as unknown as number,
			};
			const exit = yield* Effect.exit(freeze(bad as unknown as Parameters<typeof freeze>[0]));
			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				expect(String(exit.cause)).toContain("Invalid minimumReleaseAge");
			}
		}),
	);

	it.effect("freezes a materialized peer catalog verbatim", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: { silk: { packages: { vitest: { range: "^4.2.3", peer: "^4.2.0", strategy: "lock-minor" } } } },
			});
			expect(base.catalogs).toEqual({
				silk: { vitest: "^4.2.3" },
				"silk:peers": { vitest: "^4.2.0" },
			});
		}),
	);

	it.effect("returns the provided name", () =>
		Effect.gen(function* () {
			const cfg = { name: "@acme/cfg", catalogs: {} } as unknown as Parameters<typeof freeze>[0];
			const out = yield* freeze(cfg);
			expect(out.name).toBe("@acme/cfg");
			expect("name" in out.base).toBe(false);
			expect("name" in out.manifest).toBe(false);
		}),
	);

	it.effect("fails when name is missing or empty", () =>
		Effect.gen(function* () {
			const missing = { catalogs: {} } as unknown as Parameters<typeof freeze>[0];
			const empty = { name: "  ", catalogs: {} } as unknown as Parameters<typeof freeze>[0];
			expect((yield* Effect.exit(freeze(missing)))._tag).toBe("Failure");
			expect((yield* Effect.exit(freeze(empty)))._tag).toBe("Failure");
		}),
	);
});
