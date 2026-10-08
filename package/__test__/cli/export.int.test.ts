import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { runExport } from "../../src/cli/commands/export.js";
import { parseWorkspace } from "../../src/cli/workspace-file.js";
import { plainText } from "./utils/doc.js";

it.effect("resolves excludeByRepo from the workspace dir's package.json name, not cwd", () =>
	Effect.gen(function* () {
		const dir = mkdtempSync(join(tmpdir(), "rpc-exrepo-"));
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "my-mono" }), "utf8");
		const configFile = join(dir, "savvy.build.ts");
		writeFileSync(
			configFile,
			`import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
 publicHoistPattern: { value: ["@types/*", "@x/cli"], excludeByRepo: { "my-mono": ["@x/cli"] } },
});
`,
			"utf8",
		);
		const workspacePath = join(dir, "pnpm-workspace.yaml");
		writeFileSync(workspacePath, "packages:\n  - pkg/*\n", "utf8");
		yield* runExport({ configFile, workspacePath, preview: false });
		const out = parseWorkspace(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
		// @x/cli dropped for "my-mono"; resolution must come from the temp dir's package.json,
		// NOT the test process cwd (which is the rolldown-pnpm-config repo).
		expect(out.publicHoistPattern).toEqual(["@types/*"]);
	}),
);

const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 local: { publicHoistPattern: ["@override/*"] },
 catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
 overrides: { "tar@<6.2.1": ">=6.2.1" },
 publicHoistPattern: ["@types/*"],
 strictDepBuilds: true,
 confirmModulesPurge: false,
});
`;

function setup(workspaceContent?: string): { dir: string; configFile: string; workspacePath: string } {
	const dir = mkdtempSync(join(tmpdir(), "rpc-export-"));
	const configFile = join(dir, "savvy.build.ts");
	writeFileSync(configFile, CONFIG, "utf8");
	const workspacePath = join(dir, "pnpm-workspace.yaml");
	if (workspaceContent !== undefined) writeFileSync(workspacePath, workspaceContent, "utf8");
	return { dir, configFile, workspacePath };
}

describe("runExport", () => {
	it.effect("overlays managed fields, applies local, preserves unknown, drops config-only", () =>
		Effect.gen(function* () {
			const { configFile, workspacePath } = setup(
				'packages:\n  - pkg/*\ncatalogs:\n  tsdown:\n    tsdown: "^2.0.0"\nautoInstallPeers: true\n',
			);
			const res = yield* runExport({ configFile, workspacePath, preview: false });
			const out = parseWorkspace(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
			expect(res.written).toBe(true);
			expect(out.packages).toEqual(["pkg/*"]); // preserved
			expect(out.autoInstallPeers).toBe(true); // preserved
			expect(out.publicHoistPattern).toEqual(["@override/*"]); // local override applied
			expect(out.overrides).toEqual({ "tar@<6.2.1": ">=6.2.1" });
			expect((out.catalogs as Record<string, unknown>).silk).toEqual({ typescript: "^5.9.0" }); // plugin catalog
			expect((out.catalogs as Record<string, unknown>).tsdown).toEqual({ tsdown: "^2.0.0" }); // local catalog kept
			expect("confirmModulesPurge" in out).toBe(false); // config-only, dropped
		}),
	);

	it.effect("creates a fresh file when none exists", () =>
		Effect.gen(function* () {
			const { configFile, workspacePath } = setup();
			const res = yield* runExport({ configFile, workspacePath, preview: false });
			expect(res.written).toBe(true);
			const out = parseWorkspace(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
			expect((out.catalogs as Record<string, unknown>).silk).toEqual({ typescript: "^5.9.0" });
		}),
	);

	it.effect("--dry-run writes nothing", () =>
		Effect.gen(function* () {
			const { configFile, workspacePath } = setup("packages:\n  - pkg/*\n");
			const before = readFileSync(workspacePath, "utf8");
			const res = yield* runExport({ configFile, workspacePath, preview: true });
			expect(res.written).toBe(false);
			expect(res.rendered).toContain("publicHoistPattern");
			expect(readFileSync(workspacePath, "utf8")).toBe(before);
		}),
	);

	it.effect("fails cleanly on a malformed existing pnpm-workspace.yaml", () =>
		Effect.gen(function* () {
			// Tab character mixed with spaces causes a yaml parse error
			const { configFile, workspacePath } = setup("foo:\n  - a\n\t- b\n");
			const exit = yield* Effect.exit(runExport({ configFile, workspacePath, preview: false }));
			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("--dry-run returns a styled diff with added/unmanaged lines", () =>
		Effect.gen(function* () {
			const { configFile, workspacePath } = setup("packages:\n  - pkg/*\n");
			const res = yield* runExport({ configFile, workspacePath, preview: true, full: true });
			expect(res.written).toBe(false);
			expect(res.diff._tag).toBe("Lines");
			const text = plainText(res.diff);
			// publicHoistPattern comes from local override -> tagged local
			expect(text).toContain("(local)");
			// packages is unmanaged -> tagged unmanaged
			expect(text).toContain("packages");
			expect(text).toContain("(unmanaged)");
		}),
	);

	it.effect("preserves a file: override from the existing workspace on write", () =>
		Effect.gen(function* () {
			const { configFile, workspacePath } = setup(
				'overrides:\n  "rolldown-pnpm-config": "file:/abs/pkg"\n  lodash: "^4.0.0"\npackages:\n  - pkg/*\n',
			);
			const res = yield* runExport({ configFile, workspacePath, preview: false });
			expect(res.written).toBe(true);
			const out = parseWorkspace(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
			const overrides = out.overrides as Record<string, string>;
			// the local file: link survives the managed-overrides overlay
			expect(overrides["rolldown-pnpm-config"]).toBe("file:/abs/pkg");
			// a managed override is still present
			expect(overrides["tar@<6.2.1"]).toBe(">=6.2.1");
			// a non-protocol pre-existing override is NOT preserved (managed overrides replace)
			expect("lodash" in overrides).toBe(false);
		}),
	);
});
