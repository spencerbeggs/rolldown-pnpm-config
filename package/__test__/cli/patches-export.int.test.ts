import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExport } from "../../src/cli/commands/export.js";

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "rpc-export-"));
	// a config in examples/savvy with one distributed patch
	mkdirSync(join(root, "examples", "savvy", "public", "patches"), { recursive: true });
	writeFileSync(join(root, "examples", "savvy", "public", "patches", "is-odd@3.0.1.patch"), "diff\n", "utf8");
	writeFileSync(
		join(root, "examples", "savvy", "savvy.build.ts"),
		'import { PnpmConfigPlugin } from "rolldown-pnpm-config";\nPnpmConfigPlugin({ name: "@example/savvy", catalogs: {} });\n',
		"utf8",
	);
	// a root workspace file that already carries a foreign entry and a repo-root entry not owned by the plugin under test
	writeFileSync(
		join(root, "pnpm-workspace.yaml"),
		"patchedDependencies:\n  foo@2.0.0: examples/rolldown/public/patches/foo@2.0.0.patch\n  bar@1.0.0: patches/bar@1.0.0.patch\n",
		"utf8",
	);
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("runExport patch merge", () => {
	it("writes the owned patch with a local path and preserves siblings", async () => {
		const result = await Effect.runPromise(
			runExport({
				configFile: join(root, "examples", "savvy", "savvy.build.ts"),
				workspacePath: join(root, "pnpm-workspace.yaml"),
				preview: false,
			}),
		);
		const yaml = readFileSync(result.path, "utf8");
		expect(yaml).toContain("is-odd@3.0.1: examples/savvy/public/patches/is-odd@3.0.1.patch");
		expect(yaml).toContain("foo@2.0.0: examples/rolldown/public/patches/foo@2.0.0.patch");
		expect(yaml).toContain("bar@1.0.0: patches/bar@1.0.0.patch");
		// the distributed .pnpm-config path must NOT leak into the local workspace file
		expect(yaml).not.toContain(".pnpm-config");
	});

	it("respects an explicit patchedDependencies map and skips discovery", async () => {
		// an explicit hand-authored map is the escape hatch: discovery is skipped on
		// export just as it is on build, so public/patches/is-odd is NOT injected and
		// the explicit entry survives — while existing siblings are still preserved.
		writeFileSync(
			join(root, "examples", "savvy", "savvy.build.ts"),
			'import { PnpmConfigPlugin } from "rolldown-pnpm-config";\nPnpmConfigPlugin({ name: "@example/savvy", catalogs: {}, patchedDependencies: { "left-pad@1.3.0": "manual/left-pad.patch" } });\n',
			"utf8",
		);
		const result = await Effect.runPromise(
			runExport({
				configFile: join(root, "examples", "savvy", "savvy.build.ts"),
				workspacePath: join(root, "pnpm-workspace.yaml"),
				preview: false,
			}),
		);
		const yaml = readFileSync(result.path, "utf8");
		// the explicit entry survives (previously dropped by the discovery override)
		expect(yaml).toContain("left-pad@1.3.0: manual/left-pad.patch");
		// discovery is skipped — the public/patches patch is NOT injected
		expect(yaml).not.toContain("is-odd@3.0.1");
		// existing siblings are still preserved
		expect(yaml).toContain("foo@2.0.0: examples/rolldown/public/patches/foo@2.0.0.patch");
		expect(yaml).toContain("bar@1.0.0: patches/bar@1.0.0.patch");
	});
});
