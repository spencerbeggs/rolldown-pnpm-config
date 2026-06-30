import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginConfig } from "../../src/define-plugin.js";
import { isRewriteDirective, readLocalPatchesDir, withResolvedBuildPatches } from "../../src/patches/build.js";

let base: string;
beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), "rpc-build-"));
});
afterEach(() => {
	rmSync(base, { recursive: true, force: true });
});
function touch(rel: string): void {
	const abs = join(base, rel);
	mkdirSync(join(abs, ".."), { recursive: true });
	writeFileSync(abs, "diff\n", "utf8");
}
const cfg = (extra: Partial<PluginConfig>): PluginConfig =>
	({ name: "@example/savvy", catalogs: {}, ...extra }) as PluginConfig;

describe("isRewriteDirective", () => {
	it("matches only { strategy: 'rewrite' }", () => {
		expect(isRewriteDirective({ strategy: "rewrite" })).toBe(true);
		expect(isRewriteDirective({ strategy: "merge" })).toBe(false);
		expect(isRewriteDirective({ "a@1": "patches/a.patch" })).toBe(false);
		expect(isRewriteDirective(undefined)).toBe(false);
	});
});

describe("readLocalPatchesDir", () => {
	it("reads a string override from local", () => {
		expect(readLocalPatchesDir(cfg({ local: { localPatchesDir: "public/x" } }))).toBe("public/x");
	});
	it("returns undefined when absent", () => {
		expect(readLocalPatchesDir(cfg({}))).toBeUndefined();
	});
});

describe("withResolvedBuildPatches", () => {
	it("injects the distributed map when patchedDependencies is absent and patches exist", () => {
		touch("public/patches/is-odd@3.0.1.patch");
		const out = withResolvedBuildPatches(cfg({}), base);
		expect(out.patchedDependencies).toEqual({
			"is-odd@3.0.1": "node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch",
		});
	});

	it("resolves the explicit { strategy: 'rewrite' } directive the same way", () => {
		touch("public/patches/a.patch");
		const out = withResolvedBuildPatches(cfg({ patchedDependencies: { strategy: "rewrite" } }), base);
		expect(out.patchedDependencies).toEqual({ a: "node_modules/.pnpm-config/@example/savvy/patches/a.patch" });
	});

	it("excludes local-only patches from the distributed map", () => {
		touch("patches/local.patch");
		const out = withResolvedBuildPatches(cfg({}), base);
		expect(out.patchedDependencies).toBeUndefined();
	});

	it("passes an explicit map through untouched (no discovery)", () => {
		touch("public/patches/a.patch");
		const explicit = { "x@1": "patches/x.patch" };
		const out = withResolvedBuildPatches(cfg({ patchedDependencies: explicit }), base);
		expect(out.patchedDependencies).toBe(explicit);
	});

	it("drops the field when a rewrite directive finds no distributed patches", () => {
		touch("patches/local-only.patch"); // local-only only — zero distributed
		const out = withResolvedBuildPatches(cfg({ patchedDependencies: { strategy: "rewrite" } }), base);
		expect(out.patchedDependencies).toBeUndefined();
	});
});
