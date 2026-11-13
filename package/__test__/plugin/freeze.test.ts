import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { freeze } from "../../src/plugin/freeze.js";
import { catalogsOf } from "../utils/catalogs-of.js";

describe("freeze", () => {
	it.effect("produces base + manifest from a valid config", () =>
		Effect.gen(function* () {
			const out = yield* freeze({ name: "@test/cfg", catalogs: { silk: { packages: { a: "1.0.0" } } } });
			expect(out.base.catalogs).toEqual({ silk: { a: "1.0.0" } });
			expect(out.manifest.catalogs).toEqual({ strategy: "catalogs", enforcement: "warn" });
		}),
	);

	it.effect("records which catalogs carry a derived :exact variant in the catalogs manifest options", () =>
		Effect.gen(function* () {
			const out = yield* freeze({
				name: "@test/cfg",
				catalogs: {
					effected: { exact: true, packages: { a: "^1.0.0" } },
					plain: { packages: { b: "^1.0.0" } },
					// An authored name ending in `:exact` is not a derived variant.
					"legacy:exact": { packages: { c: "1.0.0" } },
				},
			});
			expect(out.manifest.catalogs).toEqual({
				strategy: "catalogs",
				enforcement: "warn",
				options: { exactCatalogs: ["effected"] },
			});
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

	it.effect("derives overrides from a catalog directive and merges them under the authored overrides", () =>
		Effect.gen(function* () {
			const { base, manifest } = yield* freeze({
				name: "@test/cfg",
				catalogs: {
					effect: {
						packages: {
							effect: { range: "^4.0.3", peer: "^4.0.0", strategy: "lock-minor" },
							"@effect/platform-node": { range: "^4.0.3", peer: "^4.0.0", strategy: "lock-minor" },
							"@effect/tsgo": "0.51.1",
						},
					},
				},
				overridesFromCatalogs: { catalog: "effect", exclude: ["@effect/tsgo"] },
				overrides: { "tar@<1": ">=1" },
			});
			expect(base.overrides).toEqual({
				"effect@^4.0.0": "4.0.3",
				"@effect/platform-node@^4.0.0": "4.0.3",
				"tar@<1": ">=1",
			});
			// The directive is not a managed field: it leaves no trace in base or manifest.
			expect(base).not.toHaveProperty("overridesFromCatalogs");
			expect(manifest).not.toHaveProperty("overridesFromCatalogs");
			expect(manifest.overrides).toEqual({ strategy: "overrides", enforcement: "warn" });
		}),
	);

	it.effect("materializes overrides from the directive alone when none are authored", () =>
		Effect.gen(function* () {
			const { base, manifest } = yield* freeze({
				name: "@test/cfg",
				catalogs: { effect: { packages: { effect: "4.0.3" } } },
				overridesFromCatalogs: { catalog: "effect" },
			});
			expect(base.overrides).toEqual({ "effect@^4.0.0": "4.0.3" });
			expect(manifest.overrides).toEqual({ strategy: "overrides", enforcement: "warn" });
		}),
	);

	it.effect("pins the catalog value of every member the overrides directive pins", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: {
					effected: {
						packages: {
							effect: { range: "~4.1.2", peer: "~4.1.0", strategy: "lock-minor" },
							"@effect/vitest": { range: "~4.1.2", peer: "~4.1.0", strategy: "lock-minor" },
							"@effected/semver": "^0.4.1",
							"@effect/tsgo": "0.51.1-beta.2",
						},
					},
				},
				overridesFromCatalogs: { catalog: "effected", include: ["effect", "@effect/*"] },
			});
			expect(base.overrides).toEqual({ "effect@^4.0.0": "4.1.2", "@effect/vitest@^4.0.0": "4.1.2" });
			// The catalog names the version the override names, so a `catalog:`
			// specifier (which pnpm never matches against an override) cannot
			// resolve a second copy.
			expect(catalogsOf(base).effected).toEqual({
				effect: "4.1.2",
				"@effect/vitest": "4.1.2",
				// Outside `include`: the range ships verbatim.
				"@effected/semver": "^0.4.1",
				// Prerelease: skipped by the directive, so verbatim too.
				"@effect/tsgo": "0.51.1-beta.2",
			});
			// The peers catalog keeps the derived peer range: packed manifests read it as the peer floor.
			expect(catalogsOf(base)["effected:peers"]).toEqual({ effect: "~4.1.0", "@effect/vitest": "~4.1.0" });
		}),
	);

	it.effect("leaves an excluded member's catalog range verbatim", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: { effect: { packages: { effect: "^4.0.3", "@effect/tsgo": "^0.51.1" } } },
				overridesFromCatalogs: { catalog: "effect", exclude: ["@effect/tsgo"] },
			});
			expect(catalogsOf(base).effect).toEqual({ effect: "4.0.3", "@effect/tsgo": "^0.51.1" });
		}),
	);

	it.effect("pins the catalog to a hand-authored exact override that wins on the same selector", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: { effect: { packages: { effect: "~4.1.2", "@effect/vitest": "~4.1.2" } } },
				overridesFromCatalogs: { catalog: "effect" },
				overrides: { "effect@^4.0.0": "4.1.5", "@effect/vitest@^4.0.0": ">=4.1.2 <4.2.0" },
			});
			expect(base.overrides).toEqual({ "effect@^4.0.0": "4.1.5", "@effect/vitest@^4.0.0": ">=4.1.2 <4.2.0" });
			// An exact winner is pinned; a range winner cannot be, so the authored range stays.
			expect(catalogsOf(base).effect).toEqual({ effect: "4.1.5", "@effect/vitest": "~4.1.2" });
		}),
	);

	it.effect("names the frozen override version in the exact catalog", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: {
					effected: {
						exact: true,
						packages: { effect: "~4.1.2", "@effect/vitest": "~4.1.2", "@effected/npm": "^0.34.0" },
					},
				},
				overridesFromCatalogs: { catalog: "effected", include: ["effect", "@effect/*"] },
				// A hand-authored exact winner moves the pinned value off the authored range.
				overrides: { "effect@^4.0.0": "4.1.5" },
			});
			expect(catalogsOf(base).effected).toEqual({
				effect: "4.1.5",
				"@effect/vitest": "4.1.2",
				"@effected/npm": "^0.34.0",
			});
			// `catalog:effected:exact` and the graph-wide pins never disagree.
			expect(catalogsOf(base)["effected:exact"]).toEqual({
				effect: "4.1.5",
				"@effect/vitest": "4.1.2",
				"@effected/npm": "0.34.0",
			});
		}),
	);

	it.effect("fails with a ConfigError when an exact catalog holds a range with no single version", () =>
		Effect.gen(function* () {
			// A typed failure, not a defect: the error channel carries it.
			const error = yield* Effect.flip(
				freeze({ name: "@test/cfg", catalogs: { c: { exact: true, packages: { wide: ">=1 <2" } } } }),
			);
			expect(error._tag).toBe("ConfigError");
			expect(error.message).toMatch(/no single version/);
		}),
	);

	it.effect("fails with a ConfigError when a range override wins over a member the exact catalog names", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				freeze({
					name: "@test/cfg",
					catalogs: { effected: { exact: true, packages: { effect: "~4.1.2" } } },
					overridesFromCatalogs: { catalog: "effected" },
					// A range winner leaves no single version for `effected:exact` to name.
					overrides: { "effect@^4.0.0": "^4.1.5" },
				}),
			);
			expect(error._tag).toBe("ConfigError");
			expect(error.message).toMatch(/"effect@\^4\.0\.0".*"\^4\.1\.5".*effected:exact/);
		}),
	);

	it.effect("allows a range override over a member left out of the exact catalog", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: {
					effected: { exact: true, packages: { effect: { range: "~4.1.2", exact: false }, other: "^1.0.0" } },
				},
				overridesFromCatalogs: { catalog: "effected", include: ["effect"] },
				overrides: { "effect@^4.0.0": "^4.1.5" },
			});
			expect(catalogsOf(base).effected).toEqual({ effect: "~4.1.2", other: "^1.0.0" });
			expect(catalogsOf(base)["effected:exact"]).toEqual({ other: "1.0.0" });
		}),
	);

	it.effect("treats a derived :exact catalog as undeclared to both catalog directives, like :peers", () =>
		Effect.gen(function* () {
			const catalogs = { effected: { exact: true, packages: { effect: "~4.1.3" } } };
			const overrides = yield* Effect.flip(
				freeze({ name: "@test/cfg", catalogs, overridesFromCatalogs: { catalog: "effected:exact" } }),
			);
			expect(overrides.message).toMatch(/catalog "effected:exact" is not declared/);
			const allowed = yield* Effect.flip(
				freeze({
					name: "@test/cfg",
					catalogs,
					peerDependencyRules: { allowedVersionsFromCatalogs: { catalog: "effected:exact", peer: "effect" } },
				}),
			);
			expect(allowed.message).toMatch(/catalog "effected:exact" is not declared/);
		}),
	);

	it.effect("leaves catalogs verbatim without the overrides directive", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: { effect: { packages: { effect: "~4.1.2" } } },
			});
			expect(catalogsOf(base).effect).toEqual({ effect: "~4.1.2" });
		}),
	);

	it.effect("fails with a ConfigError when the overrides directive names an undeclared catalog", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(
				freeze({
					name: "@test/cfg",
					catalogs: { effect: { packages: { effect: "4.0.3" } } },
					overridesFromCatalogs: { catalog: "nope" },
				}),
			);
			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("ConfigError");
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
			});
			expect(out.base.overrides).toEqual({ "tar@<1": ">=1" });
			expect(out.base.minimumReleaseAge).toBe(1440);
			expect(out.base.publicHoistPattern).toEqual(["@types/*"]);
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

describe("freeze on the pnpm 12 settings catalog", () => {
	const base = { name: "@test/cfg", catalogs: {} };

	const REFUSED: ReadonlyArray<readonly [string, unknown, string]> = [
		["allowNonAppliedPatches", true, "no pnpm reads it"],
		["ignoreDepScripts", true, "ignoreScripts or allowBuilds"],
		["ignorePatchFailures", true, "no pnpm reads it"],
		["managePackageManagerVersions", true, "pmOnFail"],
		["packageManagerStrict", true, "pmOnFail"],
		["packageManagerStrictVersion", true, "pmOnFail"],
		["useNodeVersion", "22.0.0", "devEngines.runtime"],
		["onlyBuiltDependencies", ["esbuild"], "allowBuilds"],
		["onlyBuiltDependenciesFile", "allow.json", "allowBuilds"],
		["neverBuiltDependencies", ["esbuild"], "allowBuilds with false"],
		["ignoredBuiltDependencies", ["esbuild"], "allowBuilds with false"],
		["executionEnv", { nodeVersion: "22" }, "devEngines.runtime"],
		["confirmModulesPurge", false, "pnpm 11 setting"],
	];

	for (const [field, value, hint] of REFUSED) {
		it.effect(`refuses ${field}, which pnpm 12 does not read, naming what to use instead`, () =>
			Effect.gen(function* () {
				const error = yield* Effect.flip(freeze({ ...base, [field]: value } as never));
				expect(error._tag).toBe("ConfigError");
				expect(error.message).toContain(`\`${field}\` is not a pnpm 12 setting`);
				expect(error.message).toContain(hint);
			}),
		);
	}

	it("refuses exactly the settings the table lists", () => {
		expect(REFUSED).toHaveLength(13);
	});

	it.effect("ignores a removed setting written as undefined, like any absent field", () =>
		Effect.gen(function* () {
			const out = yield* freeze({ ...base, onlyBuiltDependencies: undefined } as never);
			expect(out.base).not.toHaveProperty("onlyBuiltDependencies");
		}),
	);

	it.effect("refuses a pnpm 12 setting the plugin does not manage, instead of dropping it", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(freeze({ ...base, registry: "https://npm.example.test/" } as never));
			expect(error.message).toBe("`registry` is a pnpm 12 setting this plugin does not manage");
			// An unknown key that is no pnpm setting at all is still left to the type checker.
			const out = yield* freeze({ ...base, notASetting: 1 } as never);
			expect(out.base).not.toHaveProperty("notASetting");
		}),
	);

	it.effect("manages audit and update, the sections that supersede auditConfig and updateConfig", () =>
		Effect.gen(function* () {
			const out = yield* freeze({
				...base,
				audit: { level: "high", ignore: ["GHSA-x"] },
				update: { ignoreDeps: ["typescript"] },
			});
			expect(out.base.audit).toEqual({ level: "high", ignore: ["GHSA-x"] });
			expect(out.manifest.audit).toEqual({ strategy: "mapChildWins", enforcement: "absent" });
			expect(out.base.update).toEqual({ ignoreDeps: ["typescript"] });
		}),
	);

	it.effect("refuses a key a closed setting does not declare (auditConfig takes ignoreGhsas only)", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(freeze({ ...base, auditConfig: { ignoreCves: ["CVE-1"] } } as never));
			expect(error.message).toContain("Invalid auditConfig");
			expect(error.message).toContain("audit.ignore");
			const ok = yield* freeze({ ...base, auditConfig: { ignoreGhsas: ["GHSA-x"] } });
			expect(ok.base.auditConfig).toEqual({ ignoreGhsas: ["GHSA-x"] });
		}),
	);

	it.effect("accepts the shapes pnpm 12 added (nodeLinker loaded, lockfile object form)", () =>
		Effect.gen(function* () {
			const out = yield* freeze({ ...base, nodeLinker: "loaded", lockfile: { format: "v13" } });
			expect(out.base.nodeLinker).toBe("loaded");
			expect(out.base.lockfile).toEqual({ format: "v13" });
		}),
	);

	it.effect("ships the value pnpm reads: a coerced word becomes its boolean", () =>
		Effect.gen(function* () {
			const out = yield* freeze({ ...base, hoist: "yes" } as never);
			expect(out.base.hoist).toBe(true);
		}),
	);

	it.effect("ships peerDependencyRules as plain data, not a class instance", () =>
		Effect.gen(function* () {
			const out = yield* freeze({ ...base, peerDependencyRules: { ignoreMissing: ["@types/*"] } });
			expect(Object.getPrototypeOf(out.base.peerDependencyRules)).toBe(Object.prototype);
			expect(out.base.peerDependencyRules).toEqual({ ignoreMissing: ["@types/*"] });
		}),
	);

	it.effect("refuses an overrides key pnpm cannot parse", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(freeze({ ...base, overrides: { "a>b>c": "1.0.0" } }));
			expect(error.message).toContain("Invalid overrides");
		}),
	);
});

describe("freeze overridesFromCatalogs with a respelled authored selector", () => {
	it.effect("pins the catalog to the authored winner, whatever spelling of the selector it uses", () =>
		Effect.gen(function* () {
			const { base } = yield* freeze({
				name: "@test/cfg",
				catalogs: { effect: { packages: { effect: "^4.0.3" } } },
				overrides: { " effect@^4.0.0": "4.0.5" },
				overridesFromCatalogs: { catalog: "effect" },
			});
			expect(base.overrides).toEqual({ " effect@^4.0.0": "4.0.5" });
			expect(catalogsOf(base).effect).toEqual({ effect: "4.0.5" });
		}),
	);
});
