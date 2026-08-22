import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { checkOutcome, runUpgrade } from "../../src/cli/commands/upgrade.js";
import { makeWorkspaceResolver } from "../../src/cli/workspace-resolve.js";
import { makeStubResolver } from "./utils/stub-resolver.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/workspace-next/", import.meta.url));

const config = (range: string, peer: string) => `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: {
  effected: {
   packages: {
    "@fix/bumped": { range: "${range}", peer: "${peer}", strategy: "lock-minor", source: "workspace" },
   },
  },
 },
});
`;

const registry = makeStubResolver({ versions: {} });

describe("workspace-sourced entries on the non-interactive path", () => {
	it("applies the workspace next version even when it falls outside the caret range", async () => {
		// ^0.2.0 does NOT contain 0.3.0 (0.x caret) — a registry entry would be
		// held to in-range-only, but a workspace entry tracks the workspace.
		const file = writeTmpConfig(config("^0.2.0", "^0.2.0"));
		const out = await Effect.runPromise(
			runUpgrade({ file, resolver: registry, workspaceResolver: makeWorkspaceResolver(FIXTURE) }),
		);
		const result = readFileSync(file, "utf8");
		expect(result).toContain('range: "^0.3.0"');
		expect(result).toContain('peer: "^0.3.0"');
		expect(out.changed).toEqual(["effected.@fix/bumped"]);
	});

	it("reports drift without writing under dryRun", async () => {
		const file = writeTmpConfig(config("^0.2.0", "^0.2.0"));
		const before = readFileSync(file, "utf8");
		const out = await Effect.runPromise(
			runUpgrade({ file, resolver: registry, workspaceResolver: makeWorkspaceResolver(FIXTURE), dryRun: true }),
		);
		expect(readFileSync(file, "utf8")).toBe(before);
		expect(out.changed).toEqual(["effected.@fix/bumped"]);
	});

	it("reports no change when the entry already matches the workspace next version", async () => {
		const file = writeTmpConfig(config("^0.3.0", "^0.3.0"));
		const before = readFileSync(file, "utf8");
		const out = await Effect.runPromise(
			runUpgrade({ file, resolver: registry, workspaceResolver: makeWorkspaceResolver(FIXTURE), dryRun: true }),
		);
		expect(readFileSync(file, "utf8")).toBe(before);
		expect(out.changed).toEqual([]);
	});
});

describe("checkOutcome", () => {
	it("exits 1 and lists the drifted packages", () => {
		const out = checkOutcome(["effected.@fix/bumped"]);
		expect(out.exitCode).toBe(1);
		expect(out.text).toContain("@fix/bumped");
	});

	it("exits 0 when nothing drifted", () => {
		const out = checkOutcome([]);
		expect(out.exitCode).toBe(0);
	});
});
