import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { freeze } from "../../src/plugin/freeze.js";

describe("freeze", () => {
	it("produces base + manifest from a valid config", async () => {
		const out = await Effect.runPromise(freeze({ catalogs: { silk: { packages: { a: "1.0.0" } } } }));
		expect(out.base.catalogs).toEqual({ silk: { a: "1.0.0" } });
		expect(out.manifest.catalogs).toEqual({ strategy: "catalogs", enforcement: "warn" });
	});

	it("fails with ConfigError when catalogs are malformed", async () => {
		const bad = { catalogs: { silk: { packages: { a: 123 } } } } as unknown as Parameters<typeof freeze>[0];
		const exit = await Effect.runPromiseExit(freeze(bad));
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const err = exit.cause;
			expect(String(err)).toContain("ConfigError");
		}
	});

	it("validates + freezes every declared field with its strategy and enforcement", async () => {
		const out = await Effect.runPromise(
			freeze({
				catalogs: { silk: { packages: { a: "1.0.0" } } },
				overrides: { "tar@<1": ">=1" },
				strictDepBuilds: true,
				minimumReleaseAge: { value: 1440, enforcement: "warn" },
				publicHoistPattern: { value: ["@types/*"], excludeByRepo: { "my-repo": ["@x/cli"] } },
				allowBuilds: { esbuild: true },
				supportedArchitectures: { os: ["linux"] },
				confirmModulesPurge: false,
			}),
		);
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
	});

	it("treats a record field containing a `value` key as data, not the wrapped form", async () => {
		const out = await Effect.runPromise(
			freeze({
				catalogs: { silk: { packages: { a: "1.0.0" } } },
				overrides: { value: ">=1", lodash: ">=4" },
			}),
		);
		expect(out.base.overrides).toEqual({ value: ">=1", lodash: ">=4" });
		expect(out.manifest.overrides).toEqual({ strategy: "overrides", enforcement: "warn" });
	});

	it("fails with ConfigError naming the field when a field's value shape is wrong", async () => {
		const bad = {
			catalogs: { silk: { packages: { a: "1.0.0" } } },
			minimumReleaseAge: "soon" as unknown as number,
		};
		const exit = await Effect.runPromiseExit(freeze(bad as unknown as Parameters<typeof freeze>[0]));
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			expect(String(exit.cause)).toContain("Invalid minimumReleaseAge");
		}
	});

	it("freezes a materialized peer catalog verbatim", async () => {
		const { base } = await Effect.runPromise(
			freeze({
				catalogs: { silk: { packages: { vitest: { range: "^4.2.3", peer: "^4.2.0", strategy: "lock-minor" } } } },
			}),
		);
		expect(base.catalogs).toEqual({ silk: { vitest: "^4.2.3" }, silkPeers: { vitest: "^4.2.0" } });
	});
});
