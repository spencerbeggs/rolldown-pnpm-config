import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import type { PluginConfig } from "../../../src/define-plugin.js";

/** Options for {@link makeTmpWorkspace}. */
export interface TmpWorkspaceOptions {
	/** The catalog entry's current range literal, e.g. `"^0.2.0"`. */
	readonly range: string;
	/** The catalog entry's materialized peer literal. */
	readonly peer: string;
	/** Whether a pending minor changeset for `@fix/bumped` exists (next = 0.3.0). */
	readonly withChangeset: boolean;
}

/**
 * Build a throwaway pnpm workspace with one publishable package
 * (`@fix/bumped` at 0.2.0) and a `savvy.build.ts` declaring it as a
 * workspace-sourced catalog entry. Cleans up via onTestFinished.
 */
export function makeTmpWorkspace(opts: TmpWorkspaceOptions): {
	dir: string;
	configPath: string;
	config: PluginConfig;
} {
	const dir = mkdtempSync(join(tmpdir(), "rpc-ws-"));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
	mkdirSync(join(dir, "packages", "bumped"), { recursive: true });
	writeFileSync(
		join(dir, "packages", "bumped", "package.json"),
		JSON.stringify(
			{ name: "@fix/bumped", version: "0.2.0", private: true, publishConfig: { access: "public" } },
			null,
			"\t",
		),
		"utf8",
	);
	if (opts.withChangeset) {
		mkdirSync(join(dir, ".changeset"), { recursive: true });
		writeFileSync(join(dir, ".changeset", "bump.md"), '---\n"@fix/bumped": minor\n---\n\nBump.\n', "utf8");
	}
	const configPath = join(dir, "savvy.build.ts");
	writeFileSync(
		configPath,
		`import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: {
  effected: {
   packages: {
    "@fix/bumped": { range: "${opts.range}", peer: "${opts.peer}", strategy: "lock-minor", source: "workspace" },
   },
  },
 },
});
`,
		"utf8",
	);
	const config: PluginConfig = {
		name: "@test/cfg",
		catalogs: {
			effected: {
				packages: {
					"@fix/bumped": { range: opts.range, peer: opts.peer, strategy: "lock-minor", source: "workspace" },
				},
			},
		},
	};
	return { dir, configPath, config };
}
