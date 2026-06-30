// package/__test__/plugin/patches-build.int.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "rolldown";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PnpmConfigPlugin } from "../../src/plugin/index.js";

let base: string;
let cwd: string;
beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), "rpc-plugin-"));
	mkdirSync(join(base, "public", "patches"), { recursive: true });
	writeFileSync(join(base, "public", "patches", "is-odd@3.0.1.patch"), "diff\n", "utf8");
	cwd = process.cwd();
	process.chdir(base);
});
afterEach(() => {
	process.chdir(cwd);
	rmSync(base, { recursive: true, force: true });
});

async function loadPnpmfile(plugin: Plugin): Promise<string> {
	const id = "rolldown-pnpm-config/virtual/pnpmfile";
	const resolved = (plugin.resolveId as (s: string) => string | null)(id);
	const load = plugin.load as (id: string) => Promise<string | null>;
	const out = await load(resolved as string);
	return out as string;
}

describe("PnpmConfigPlugin patch discovery", () => {
	it("bakes the distributed patch path into base.patchedDependencies", async () => {
		const plugin = PnpmConfigPlugin({ name: "@example/savvy", catalogs: {} });
		const src = await loadPnpmfile(plugin);
		expect(src).toContain(
			'"patchedDependencies":{"is-odd@3.0.1":"node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch"}',
		);
	});
});
