import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { distributedPatchPath, distributedRel } from "../../src/patches/paths.js";

describe("distributedPatchPath", () => {
	it("builds the .pnpm-config consumer path for a scoped name", () => {
		expect(distributedPatchPath("@example/savvy", "patches/is-odd@3.0.1.patch")).toBe(
			"node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch",
		);
	});
	it("uses POSIX separators regardless of input", () => {
		expect(distributedPatchPath("cfg", "patches\\a.patch")).toBe("node_modules/.pnpm-config/cfg/patches/a.patch");
	});
});

describe("distributedRel", () => {
	const base = join("/repo", "examples", "savvy");
	it("returns the path relative to public/ for the default dist root", () => {
		expect(distributedRel(base, join(base, "public", "patches"), "is-odd@3.0.1.patch")).toBe(
			"patches/is-odd@3.0.1.patch",
		);
	});
	it("honors a public/ subfolder override", () => {
		expect(distributedRel(base, join(base, "public", "foo"), "a.patch")).toBe("foo/a.patch");
	});
	it("falls back to the dist-root basename when outside public/", () => {
		expect(distributedRel(base, join("/elsewhere", "vendor", "patches"), "a.patch")).toBe("patches/a.patch");
	});
});
