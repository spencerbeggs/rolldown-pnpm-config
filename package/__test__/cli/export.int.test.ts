import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { runExport } from "../../src/cli/commands/export.js";

const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
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

	it("--preview writes nothing", async () => {
		const { configFile, workspacePath } = setup("packages:\n  - pkg/*\n");
		const before = readFileSync(workspacePath, "utf8");
		const res = await Effect.runPromise(runExport({ configFile, workspacePath, preview: true }));
		expect(res.written).toBe(false);
		expect(res.rendered).toContain("publicHoistPattern");
		expect(readFileSync(workspacePath, "utf8")).toBe(before);
	});
});
