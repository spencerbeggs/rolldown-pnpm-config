import { describe, expect, it } from "vitest";
import type { CatalogDeclaration } from "../../src/catalogs.js";
import { deriveOverrides, resolveOverrides } from "../../src/plugin/overrides-from-catalogs.js";

const catalogs: Record<string, CatalogDeclaration> = {
	effect: {
		packages: {
			effect: { range: "^4.0.3", peer: "^4.0.0", strategy: "lock-minor" },
			"@effect/platform-node": { range: "^4.0.3", peer: "^4.0.0", strategy: "lock-minor" },
			"@effect/vitest": "4.0.3", // bare-string exact entry — also participates
			"@effect/tsgo": "0.51.1", // a 0.x line: the caret line is ^0.51.0
			"@scope/tiny": "^0.0.3", // a 0.0.x version has no caret line; the tilde line ~0.0.0 covers it
			"@effect/rc": "4.0.0-rc.118", // prerelease — skipped, a caret line cannot name it
			"@effect/wide": ">=4 <5", // compound range — skipped
		},
	},
};

describe("deriveOverrides", () => {
	it("pins every simple-range member to its exact catalog version, scoped to its caret line", () => {
		expect(deriveOverrides(catalogs, { catalog: "effect" })).toEqual({
			"effect@^4.0.0": "4.0.3",
			"@effect/platform-node@^4.0.0": "4.0.3",
			"@effect/vitest@^4.0.0": "4.0.3",
			"@effect/tsgo@^0.51.0": "0.51.1",
			"@scope/tiny@~0.0.0": "0.0.3",
		});
	});

	it("skips prerelease and compound-range members rather than widening them", () => {
		const keys = Object.keys(deriveOverrides(catalogs, { catalog: "effect" })).join();
		expect(keys).not.toContain("@effect/rc");
		expect(keys).not.toContain("@effect/wide");
	});

	it("drops excluded members", () => {
		const table = deriveOverrides(catalogs, { catalog: "effect", exclude: ["@effect/tsgo"] });
		expect(table).not.toHaveProperty("@effect/tsgo@^0.51.0");
		expect(table["effect@^4.0.0"]).toBe("4.0.3");
	});

	it('emits an unscoped selector when scope is "any"', () => {
		expect(
			deriveOverrides(catalogs, { catalog: "effect", scope: "any", exclude: ["@effect/tsgo", "@scope/tiny"] }),
		).toEqual({
			effect: "4.0.3",
			"@effect/platform-node": "4.0.3",
			"@effect/vitest": "4.0.3",
		});
	});

	it("merges multiple directives (array form)", () => {
		const table = deriveOverrides({ ...catalogs, tools: { packages: { tsgo: "7.0.2" } } }, [
			{ catalog: "effect" },
			{ catalog: "tools" },
		]);
		expect(table["effect@^4.0.0"]).toBe("4.0.3");
		expect(table["tsgo@^7.0.0"]).toBe("7.0.2");
	});

	it("throws when the catalog is absent or an excluded member is not in it", () => {
		expect(() => deriveOverrides(catalogs, { catalog: "nope" })).toThrow(/not declared/);
		expect(() => deriveOverrides(catalogs, { catalog: "effect", exclude: ["ghost"] })).toThrow(/not in catalog/);
	});
});

describe("resolveOverrides", () => {
	it("merges derived entries under the authored overrides, which win on a key clash", () => {
		expect(resolveOverrides({ "effect@^4.0.0": "PINNED", "tar@<1": ">=1" }, { catalog: "effect" }, catalogs)).toEqual({
			"effect@^4.0.0": "PINNED",
			"@effect/platform-node@^4.0.0": "4.0.3",
			"@effect/vitest@^4.0.0": "4.0.3",
			"@effect/tsgo@^0.51.0": "0.51.1",
			"@scope/tiny@~0.0.0": "0.0.3",
			"tar@<1": ">=1",
		});
	});

	it("yields the derived table alone when no overrides are authored", () => {
		expect(
			resolveOverrides(undefined, { catalog: "effect", exclude: ["@effect/tsgo", "@scope/tiny"] }, catalogs),
		).toEqual({
			"effect@^4.0.0": "4.0.3",
			"@effect/platform-node@^4.0.0": "4.0.3",
			"@effect/vitest@^4.0.0": "4.0.3",
		});
	});

	it("passes authored overrides through untouched without a directive", () => {
		const v = { "tar@<1": ">=1" };
		expect(resolveOverrides(v, undefined, catalogs)).toBe(v);
	});
});
