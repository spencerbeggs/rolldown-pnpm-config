import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = join(import.meta.dirname, "..", "dist", "dev", "pkg");

/** Find the built `.`-entry source by content — `exports["."]` is a conditional object, not a string. */
const readCatalogsEntry = (): string => {
	for (const entry of readdirSync(pkgDir, { recursive: true })) {
		const name = entry.toString();
		if (!name.endsWith(".js")) continue;
		const src = readFileSync(join(pkgDir, name), "utf8");
		if (src.includes("new Map(")) return src;
	}
	throw new Error("no built entry containing `new Map(` found in dist/dev/pkg");
};

describe("example build artifacts", () => {
	it("emits a self-contained pnpmfile.mjs with createHooks(base, manifest) and no effect import", () => {
		const src = readFileSync(join(pkgDir, "pnpmfile.mjs"), "utf8");
		expect(src).toContain("createHooks");
		expect(src).not.toContain('from "effect"');
		// base + manifest are both serialized into the call; the manifest carries
		// the strategy entries for the configured fields.
		expect(src).toContain("strictDepBuilds");
		expect(src).toContain('"strategy"');
		expect(src).toMatch(/createHooks\(\s*\{/);
	});

	it("emits a pnpmfile.cjs", () => {
		expect(() => readFileSync(join(pkgDir, "pnpmfile.cjs"), "utf8")).not.toThrow();
	});

	it("emits a catalogs Map reflecting the configured packages", () => {
		const indexSrc = readCatalogsEntry();
		expect(indexSrc).toContain("new Map(");
		expect(indexSrc).toContain("@effect/platform-node");
		// materialized peer catalogs are emitted under both names during the transition
		expect(indexSrc).toContain("effectPeers");
		expect(indexSrc).toContain("effect:peers");
	});

	it("emits the peerDependencyRules.allowedVersions derived from the catalog directive", () => {
		const src = readFileSync(join(pkgDir, "pnpmfile.mjs"), "utf8");
		// allowedVersionsFromCatalogs derives a version-qualified rule for each exact
		// pinned entry; @effect/tsgo (0.24.1, exact) qualifies.
		expect(src).toContain("allowedVersions");
		expect(src).toContain("@effect/tsgo@0.24.1>effect");
	});
});
