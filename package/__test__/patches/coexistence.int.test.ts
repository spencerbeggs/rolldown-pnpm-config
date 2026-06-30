import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginConfig } from "../../src/define-plugin.js";
import { withResolvedBuildPatches } from "../../src/patches/build.js";
import { discoverPatches } from "../../src/patches/discover.js";

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "rpc-coexist-"));
	const mk = (rel: string): void => {
		const abs = join(root, rel);
		mkdirSync(join(abs, ".."), { recursive: true });
		writeFileSync(abs, "diff\n", "utf8");
	};
	mk("examples/savvy/public/patches/is-odd@3.0.1.patch");
	mk("examples/savvy/patches/react.patch");
	mk("examples/rolldown/public/patches/foo@2.0.0.patch");
	mk("patches/bar@1.0.0.patch");
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});
const cfg = (name: string): PluginConfig => ({ name, catalogs: {} }) as PluginConfig;

describe("two plugins + a repo-own patch", () => {
	it("each plugin bakes only its own distributed patch under its own .pnpm-config prefix", () => {
		const savvy = withResolvedBuildPatches(cfg("@example/savvy"), join(root, "examples", "savvy"));
		const rolldown = withResolvedBuildPatches(cfg("@example/rolldown"), join(root, "examples", "rolldown"));

		expect(savvy.patchedDependencies).toEqual({
			"is-odd@3.0.1": "node_modules/.pnpm-config/@example/savvy/patches/is-odd@3.0.1.patch",
		});
		expect(rolldown.patchedDependencies).toEqual({
			"foo@2.0.0": "node_modules/.pnpm-config/@example/rolldown/patches/foo@2.0.0.patch",
		});
	});

	it("local export paths for savvy include its local-only patch and exclude foreign ones", () => {
		const owned = discoverPatches({ baseDir: join(root, "examples", "savvy"), name: "@example/savvy" });
		const local = Object.fromEntries(owned.map((p) => [p.key, relative(root, p.absPath).split(/[\\/]/).join("/")]));
		expect(local).toEqual({
			"is-odd@3.0.1": "examples/savvy/public/patches/is-odd@3.0.1.patch",
			react: "examples/savvy/patches/react.patch",
		});
		// rolldown's and the repo-own patch are NOT owned by savvy
		expect(Object.keys(local)).not.toContain("foo@2.0.0");
		expect(Object.keys(local)).not.toContain("bar@1.0.0");
	});
});
