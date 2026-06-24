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
	it("emits a self-contained pnpmfile.mjs with createHooks and no effect import", () => {
		const src = readFileSync(join(pkgDir, "pnpmfile.mjs"), "utf8");
		expect(src).toContain("createHooks");
		expect(src).not.toContain('from "effect"');
	});

	it("emits a pnpmfile.cjs", () => {
		expect(() => readFileSync(join(pkgDir, "pnpmfile.cjs"), "utf8")).not.toThrow();
	});

	it("emits a catalogs Map reflecting the configured packages", () => {
		const indexSrc = readCatalogsEntry();
		expect(indexSrc).toContain("new Map(");
		expect(indexSrc).toContain("typescript");
		expect(indexSrc).toContain("silkPeers");
	});
});
