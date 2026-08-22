import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { checkFailureOutcome, checkOutcome, runUpgrade } from "../../src/cli/commands/upgrade.js";
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
		expect(out.changed).toEqual([{ name: "effected.@fix/bumped", source: "workspace" }]);
	});

	it("reports drift without writing under dryRun", async () => {
		const file = writeTmpConfig(config("^0.2.0", "^0.2.0"));
		const before = readFileSync(file, "utf8");
		const out = await Effect.runPromise(
			runUpgrade({ file, resolver: registry, workspaceResolver: makeWorkspaceResolver(FIXTURE), dryRun: true }),
		);
		expect(readFileSync(file, "utf8")).toBe(before);
		expect(out.changed).toEqual([{ name: "effected.@fix/bumped", source: "workspace" }]);
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
	it("exits 1 and lists the drifted packages annotated with their version source", () => {
		// PIN: in a mixed catalog a human reading the gate's output must see which
		// rows track the workspace and which track the registry.
		const out = checkOutcome([
			{ name: "effected.@fix/bumped", source: "workspace" },
			{ name: "silk.typescript", source: "registry" },
		]);
		expect(out.exitCode).toBe(1);
		expect(out.text).toContain("  effected.@fix/bumped  (workspace)");
		expect(out.text).toContain("  silk.typescript  (registry)");
	});

	it("exits 0 when nothing drifted", () => {
		const out = checkOutcome([]);
		expect(out.exitCode).toBe(0);
	});

	it("never labels a drift result as a resolution error", () => {
		const out = checkOutcome([{ name: "effected.@fix/bumped", source: "workspace" }]);
		expect(out.text).toContain("Catalog drift detected");
		expect(out.text).not.toContain("resolution error");
	});
});

describe("checkFailureOutcome", () => {
	// PIN: --check exits non-zero on drift AND on resolution/peer failures, and
	// the consuming gate treats any non-zero as "drifted". The OUTPUT must name
	// the failure family so a human reading the CI log is not lied to.
	it("exits 1 and labels the failure as a resolution error, never as drift", () => {
		const out = checkFailureOutcome("Could not resolve 1 package(s) from the registry:\n  @fix/typo");
		expect(out.exitCode).toBe(1);
		expect(out.text).toContain("resolution error");
		expect(out.text).toContain("@fix/typo");
		expect(out.text).not.toContain("Catalog drift detected");
	});
});
