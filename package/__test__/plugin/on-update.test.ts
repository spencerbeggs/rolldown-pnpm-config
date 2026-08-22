import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { CatalogChanges } from "../../src/catalogs.js";
import { freeze } from "../../src/plugin/freeze.js";
import { createPnpmConfigPlugin } from "../../src/plugin/index.js";
import { syncWorkspaceCatalogs } from "../../src/plugin/workspace-sync.js";
import { makeTmpWorkspace } from "./utils/tmp-workspace.js";

const callHook = <T>(hook: unknown, ...args: unknown[]): T => {
	const fn = typeof hook === "function" ? hook : (hook as { handler: (...a: unknown[]) => T }).handler;
	return (fn as (...a: unknown[]) => T).apply({}, args);
};

describe("syncWorkspaceCatalogs", () => {
	it("rewrites a drifted workspace-sourced range in source and in memory, reporting the change", async () => {
		const { dir, configPath, config } = makeTmpWorkspace({ range: "^0.2.0", peer: "^0.2.0", withChangeset: true });
		const out = await Effect.runPromise(syncWorkspaceCatalogs(config, dir));
		expect(out.changes).toEqual([{ catalog: "effected", pkg: "@fix/bumped", from: "^0.2.0", to: "^0.3.0" }]);
		const rewritten = readFileSync(configPath, "utf8");
		expect(rewritten).toContain('range: "^0.3.0"');
		expect(rewritten).toContain('peer: "^0.3.0"');
		const spec = out.config.catalogs.effected?.packages["@fix/bumped"];
		expect(spec).toEqual({ range: "^0.3.0", peer: "^0.3.0", strategy: "lock-minor", source: "workspace" });
	});

	it("is a no-op when the entry already matches the workspace next version", async () => {
		const { configPath, dir, config } = makeTmpWorkspace({ range: "^0.2.0", peer: "^0.2.0", withChangeset: false });
		const before = readFileSync(configPath, "utf8");
		const out = await Effect.runPromise(syncWorkspaceCatalogs(config, dir));
		expect(out.changes).toEqual([]);
		expect(out.config).toBe(config);
		expect(readFileSync(configPath, "utf8")).toBe(before);
	});

	it("never touches the filesystem when no entry declares source workspace", async () => {
		const config = {
			name: "@test/cfg",
			catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
		};
		const out = await Effect.runPromise(syncWorkspaceCatalogs(config, "/nonexistent/nowhere"));
		expect(out.changes).toEqual([]);
		expect(out.config).toBe(config);
	});
});

describe("plugin onCatalogUpdate wiring", () => {
	it("fires once with the changes after the rewrite, and the emitted catalog carries the new range", async () => {
		const { dir, config } = makeTmpWorkspace({ range: "^0.2.0", peer: "^0.2.0", withChangeset: true });
		const seen: CatalogChanges[] = [];
		const plugin = createPnpmConfigPlugin(
			{ ...config, onCatalogUpdate: (changes) => void seen.push(changes) },
			{ freeze, cwd: dir },
		);
		const src = await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/catalogs");
		expect(seen).toHaveLength(1);
		expect(seen[0]).toEqual([{ catalog: "effected", pkg: "@fix/bumped", from: "^0.2.0", to: "^0.3.0" }]);
		expect(src).toContain('"^0.3.0"');
		expect(src).not.toContain('"^0.2.0"');
	});

	it("does not fire on a no-op build", async () => {
		const { dir, config } = makeTmpWorkspace({ range: "^0.2.0", peer: "^0.2.0", withChangeset: false });
		const seen: CatalogChanges[] = [];
		const plugin = createPnpmConfigPlugin(
			{ ...config, onCatalogUpdate: (changes) => void seen.push(changes) },
			{ freeze, cwd: dir },
		);
		await callHook<Promise<string | null>>(plugin.load, "\0rolldown-pnpm-config/virtual/catalogs");
		expect(seen).toHaveLength(0);
	});
});
