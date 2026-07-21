import { describe, expect, it } from "vitest";
import type { CatalogDeclaration } from "../../src/catalogs.js";
import { deriveAllowedVersions, resolvePeerDependencyRules } from "../../src/plugin/allowed-versions.js";

const catalogs: Record<string, CatalogDeclaration> = {
	effect: {
		packages: {
			effect: { range: "4.0.0-beta.99", peer: "4.0.0-beta.99", strategy: "lock" },
			"@effect/platform-node": { range: "4.0.0-beta.99", peer: "4.0.0-beta.99", strategy: "lock" },
			"@effect/vitest": "4.0.0-beta.99", // bare-string exact entry — also participates
			"@effect/loose": { range: "^4.0.0", strategy: "lock" }, // non-exact — skipped
		},
	},
	v3: {
		packages: {
			effect: "^3.21.4", // a RANGE peer
			"@effect/platform": "^0.96.0", // non-exact satellite — skipped
			"@effect/pinned": "0.96.0", // exact satellite
		},
	},
};

describe("deriveAllowedVersions", () => {
	it("emits a rule per exact entry (any strategy, incl. bare strings), valued at the verbatim peer version", () => {
		const table = deriveAllowedVersions(catalogs, { catalog: "effect", peer: "effect" });
		expect(table).toEqual({
			"@effect/platform-node@4.0.0-beta.99>effect": "4.0.0-beta.99",
			"@effect/vitest@4.0.0-beta.99>effect": "4.0.0-beta.99",
		});
		// the peer gets no rule of its own; the non-exact entry is skipped
		expect(Object.keys(table).join()).not.toContain("effect@4.0.0-beta.99>effect");
		expect(Object.keys(table).join()).not.toContain("loose");
	});

	it("uses the peer's catalog value verbatim when no prefix is given (a range stays a range)", () => {
		expect(deriveAllowedVersions(catalogs, { catalog: "v3", peer: "effect" })).toEqual({
			"@effect/pinned@0.96.0>effect": "^3.21.4",
		});
	});

	it("re-prefixes the value with a supplied operator", () => {
		expect(deriveAllowedVersions(catalogs, { catalog: "effect", peer: "effect", prefix: "^" })).toEqual({
			"@effect/platform-node@4.0.0-beta.99>effect": "^4.0.0-beta.99",
			"@effect/vitest@4.0.0-beta.99>effect": "^4.0.0-beta.99",
		});
		expect(deriveAllowedVersions(catalogs, { catalog: "v3", peer: "effect", prefix: ">=" })).toEqual({
			"@effect/pinned@0.96.0>effect": ">=3.21.4",
		});
	});

	it("strips the operator to an exact version when prefix is null or empty", () => {
		expect(deriveAllowedVersions(catalogs, { catalog: "v3", peer: "effect", prefix: null })).toEqual({
			"@effect/pinned@0.96.0>effect": "3.21.4",
		});
		expect(deriveAllowedVersions(catalogs, { catalog: "v3", peer: "effect", prefix: "" })).toEqual({
			"@effect/pinned@0.96.0>effect": "3.21.4",
		});
	});

	it("merges multiple directives (array form)", () => {
		const table = deriveAllowedVersions(catalogs, [
			{ catalog: "effect", peer: "effect" },
			{ catalog: "v3", peer: "effect" },
		]);
		expect(table["@effect/platform-node@4.0.0-beta.99>effect"]).toBe("4.0.0-beta.99");
		expect(table["@effect/pinned@0.96.0>effect"]).toBe("^3.21.4");
	});

	it("throws when the catalog or peer is absent", () => {
		expect(() => deriveAllowedVersions(catalogs, { catalog: "effect", peer: "nope" })).toThrow(/not in catalog/);
		expect(() => deriveAllowedVersions(catalogs, { catalog: "nope", peer: "effect" })).toThrow(/not declared/);
	});
});

describe("resolvePeerDependencyRules", () => {
	it("derives, merges into allowedVersions, and strips the directive", () => {
		const resolved = resolvePeerDependencyRules(
			{ allowedVersionsFromCatalogs: { catalog: "effect", peer: "effect" }, ignoreMissing: ["react"] },
			catalogs,
		) as Record<string, unknown>;
		expect(resolved).not.toHaveProperty("allowedVersionsFromCatalogs");
		expect(resolved.ignoreMissing).toEqual(["react"]); // other keys preserved
		expect(resolved.allowedVersions).toEqual({
			"@effect/platform-node@4.0.0-beta.99>effect": "4.0.0-beta.99",
			"@effect/vitest@4.0.0-beta.99>effect": "4.0.0-beta.99",
		});
	});

	it("lets a manually-authored allowedVersions entry win over a derived one", () => {
		const resolved = resolvePeerDependencyRules(
			{
				allowedVersionsFromCatalogs: { catalog: "effect", peer: "effect" },
				allowedVersions: { "@effect/vitest@4.0.0-beta.99>effect": "PINNED" },
			},
			catalogs,
		) as { allowedVersions: Record<string, string> };
		expect(resolved.allowedVersions["@effect/vitest@4.0.0-beta.99>effect"]).toBe("PINNED");
		expect(resolved.allowedVersions["@effect/platform-node@4.0.0-beta.99>effect"]).toBe("4.0.0-beta.99");
	});

	it("passes a value without the directive through untouched", () => {
		const v = { allowedVersions: { react: "18" } };
		expect(resolvePeerDependencyRules(v, catalogs)).toBe(v);
	});
});
