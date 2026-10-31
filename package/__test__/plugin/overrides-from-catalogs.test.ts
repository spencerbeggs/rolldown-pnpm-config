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

describe("deriveOverrides member filters", () => {
	// One catalog holding a release family pinned graph-wide (effect, @effect/*)
	// beside a kit that must not be (@effected/*), the shape #277 asks for.
	const merged: Record<string, CatalogDeclaration> = {
		effected: {
			packages: {
				effect: "~4.1.1",
				"@effect/platform-node": "~4.1.1",
				"@effect/vitest": "~4.1.1",
				"@effected/cli": "^0.25.0",
				"@effected/npm": { range: "^0.29.0", source: "workspace" },
			},
		},
	};

	it("pins only the members an include pattern selects", () => {
		expect(deriveOverrides(merged, { catalog: "effected", include: ["effect", "@effect/*"] })).toEqual({
			"effect@^4.0.0": "4.1.1",
			"@effect/platform-node@^4.0.0": "4.1.1",
			"@effect/vitest@^4.0.0": "4.1.1",
		});
	});

	it("adds no override for a new member outside the include patterns", () => {
		const grown = {
			effected: { packages: { ...merged.effected?.packages, "@effected/brand-new": "^0.1.0" } },
		};
		const table = deriveOverrides(grown, { catalog: "effected", include: ["effect", "@effect/*"] });
		expect(Object.keys(table).some((k) => k.startsWith("@effected/"))).toBe(false);
	});

	it("accepts a pattern in exclude", () => {
		expect(Object.keys(deriveOverrides(merged, { catalog: "effected", exclude: ["@effected/*"] })).sort()).toEqual([
			"@effect/platform-node@^4.0.0",
			"@effect/vitest@^4.0.0",
			"effect@^4.0.0",
		]);
	});

	it("does not let * cross the scope separator", () => {
		expect(() => deriveOverrides(merged, { catalog: "effected", include: ["@effect*"] })).toThrow(/not in catalog/);
	});

	it("excludes a member matched by both include and exclude", () => {
		const table = deriveOverrides(merged, {
			catalog: "effected",
			include: ["effect", "@effect/*"],
			exclude: ["@effect/vitest"],
		});
		expect(table).not.toHaveProperty("@effect/vitest@^4.0.0");
		expect(table["effect@^4.0.0"]).toBe("4.1.1");
	});

	it("throws when an include or exclude pattern matches no member", () => {
		expect(() => deriveOverrides(merged, { catalog: "effected", include: ["@efect/*"] })).toThrow(
			/included member "@efect\/\*" is not in catalog "effected"/,
		);
		expect(() => deriveOverrides(merged, { catalog: "effected", exclude: ["@effectd/*"] })).toThrow(
			/excluded member "@effectd\/\*" is not in catalog "effected"/,
		);
	});

	it("throws on an empty include rather than pinning nothing", () => {
		expect(() => deriveOverrides(merged, { catalog: "effected", include: [] })).toThrow(/include .* is empty/);
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

	it("ignores an authored overrides array rather than spreading it into index keys", () => {
		expect(
			resolveOverrides(["tar@<1"], { catalog: "effect", exclude: ["@effect/tsgo", "@scope/tiny"] }, catalogs),
		).toEqual({
			"effect@^4.0.0": "4.0.3",
			"@effect/platform-node@^4.0.0": "4.0.3",
			"@effect/vitest@^4.0.0": "4.0.3",
		});
	});
});
