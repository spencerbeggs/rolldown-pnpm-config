import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runPreviewViews } from "../../src/cli/commands/preview.js";
import { toAnsi } from "../../src/cli/ui/ansi.js";

const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
 overrides: { "tar@<6.2.1": ">=6.2.1" },
});
`;

function setup(workspaceContent: string): { configFile: string; workspacePath: string } {
	const dir = mkdtempSync(join(tmpdir(), "rpc-preview-"));
	const configFile = join(dir, "savvy.build.ts");
	writeFileSync(configFile, CONFIG, "utf8");
	const workspacePath = join(dir, "pnpm-workspace.yaml");
	writeFileSync(workspacePath, workspaceContent, "utf8");
	return { configFile, workspacePath };
}

describe("runPreviewViews", () => {
	it("returns three views; simulated shows the local file: override as removed", async () => {
		const { configFile, workspacePath } = setup(
			'overrides:\n  "rolldown-pnpm-config": "file:/abs/pkg"\npackages:\n  - pkg/*\n',
		);
		const views = await Effect.runPromise(runPreviewViews({ configFile, workspacePath }));
		expect(views.changes.length).toBeGreaterThan(0);
		expect(views.full.length).toBeGreaterThanOrEqual(views.changes.length);
		// changes view preserves the file: link (no removal gutter); simulated shows it as unique-to-repo
		// NOTE: brief used .not.toContain("- ") but YAML array items ("- pkg/*") also contain "- ";
		// the correct check is that no LINE starts with "- " (the removal gutter).
		expect(toAnsi(views.changes, { color: false })).not.toMatch(/^- /m);
		expect(toAnsi(views.simulated, { color: false })).toContain("rolldown-pnpm-config");
	});
});
