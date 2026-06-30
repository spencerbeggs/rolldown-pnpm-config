import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverPatches } from "../../src/patches/discover.js";

let base: string;
beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), "rpc-discover-"));
});
afterEach(() => {
	rmSync(base, { recursive: true, force: true });
});

function touch(rel: string): void {
	const abs = join(base, rel);
	mkdirSync(join(abs, ".."), { recursive: true });
	writeFileSync(abs, "diff\n", "utf8");
}

describe("discoverPatches", () => {
	it("classifies public/patches as distributed and patches/ as local-only", () => {
		touch("public/patches/is-odd@3.0.1.patch");
		touch("patches/react.patch");
		const found = discoverPatches({ baseDir: base, name: "@example/savvy" });

		const dist = found.find((p) => p.key === "is-odd@3.0.1");
		expect(dist).toMatchObject({
			distributed: true,
			distributedPath: "node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch",
		});

		const local = found.find((p) => p.key === "react");
		expect(local?.distributed).toBe(false);
		expect(local?.distributedPath).toBeUndefined();
	});

	it("ignores non-.patch files", () => {
		touch("public/patches/README.md");
		expect(discoverPatches({ baseDir: base, name: "cfg" })).toHaveLength(0);
	});

	it("returns [] when neither folder exists", () => {
		expect(discoverPatches({ baseDir: base, name: "cfg" })).toEqual([]);
	});

	it("honors a localPatchesDir override for the distributed root", () => {
		touch("public/vendored/a.patch");
		const found = discoverPatches({ baseDir: base, name: "cfg", localPatchesDir: "public/vendored" });
		expect(found.find((p) => p.key === "a")).toMatchObject({
			distributed: true,
			distributedPath: "node_modules/.pnpm-config/cfg/vendored/a.patch",
		});
	});
});
