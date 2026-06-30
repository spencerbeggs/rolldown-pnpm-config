import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { runExport } from "../../src/cli/commands/export.js";
import { toAnsi } from "../../src/cli/ui/ansi.js";

it("resolves excludeByRepo from the workspace dir's package.json name, not cwd", async () => {
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
	await Effect.runPromise(runExport({ configFile, workspacePath, preview: false }));
	const out = parse(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
	// @x/cli dropped for "my-mono"; resolution must come from the temp dir's package.json,
	// NOT the test process cwd (which is the rolldown-pnpm-config repo).
	expect(out.publicHoistPattern).toEqual(["@types/*"]);
});

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
	it("overlays managed fields, applies local, preserves unknown, drops config-only", async () => {
		const { configFile, workspacePath } = setup(
			'packages:\n  - pkg/*\ncatalogs:\n  tsdown:\n    tsdown: "^2.0.0"\nautoInstallPeers: true\n',
		);
		const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: false }));
		const out = parse(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
		expect(res.written).toBe(true);
		expect(out.packages).toEqual(["pkg/*"]); // preserved
		expect(out.autoInstallPeers).toBe(true); // preserved
		expect(out.publicHoistPattern).toEqual(["@override/*"]); // local override applied
		expect(out.overrides).toEqual({ "tar@<6.2.1": ">=6.2.1" });
		expect((out.catalogs as Record<string, unknown>).silk).toEqual({ typescript: "^5.9.0" }); // plugin catalog
		expect((out.catalogs as Record<string, unknown>).tsdown).toEqual({ tsdown: "^2.0.0" }); // local catalog kept
		expect("confirmModulesPurge" in out).toBe(false); // config-only, dropped
	});

	it("creates a fresh file when none exists", async () => {
		const { configFile, workspacePath } = setup();
		const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: false }));
		expect(res.written).toBe(true);
		const out = parse(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
		expect((out.catalogs as Record<string, unknown>).silk).toEqual({ typescript: "^5.9.0" });
	});

	it("--dry-run writes nothing", async () => {
		const { configFile, workspacePath } = setup("packages:\n  - pkg/*\n");
		const before = readFileSync(workspacePath, "utf8");
		const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: true }));
		expect(res.written).toBe(false);
		expect(res.rendered).toContain("publicHoistPattern");
		expect(readFileSync(workspacePath, "utf8")).toBe(before);
	});

	it("fails cleanly on a malformed existing pnpm-workspace.yaml", async () => {
		// Tab character mixed with spaces causes a yaml parse error
		const { configFile, workspacePath } = setup("foo:\n  - a\n\t- b\n");
		const exit = await Effect.runPromiseExit(runExport({ configFile, workspacePath, preview: false }));
		expect(Exit.isFailure(exit)).toBe(true);
	});

	it("--dry-run returns a styled diff with added/unmanaged lines", async () => {
		const { configFile, workspacePath } = setup("packages:\n  - pkg/*\n");
		const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: true, full: true }));
		expect(res.written).toBe(false);
		expect(Array.isArray(res.diff)).toBe(true);
		const text = toAnsi(res.diff, { color: false });
		// publicHoistPattern comes from local override -> tagged local
		expect(text).toContain("(local)");
		// packages is unmanaged -> tagged unmanaged
		expect(text).toContain("packages");
		expect(text).toContain("(unmanaged)");
	});

	it("preserves a file: override from the existing workspace on write", async () => {
		const { configFile, workspacePath } = setup(
			'overrides:\n  "rolldown-pnpm-config": "file:/abs/pkg"\n  lodash: "^4.0.0"\npackages:\n  - pkg/*\n',
		);
		const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: false }));
		expect(res.written).toBe(true);
		const out = parse(readFileSync(workspacePath, "utf8")) as Record<string, unknown>;
		const overrides = out.overrides as Record<string, string>;
		// the local file: link survives the managed-overrides overlay
		expect(overrides["rolldown-pnpm-config"]).toBe("file:/abs/pkg");
		// a managed override is still present
		expect(overrides["tar@<6.2.1"]).toBe(">=6.2.1");
		// a non-protocol pre-existing override is NOT preserved (managed overrides replace)
		expect("lodash" in overrides).toBe(false);
	});
});
