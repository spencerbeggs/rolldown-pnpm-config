import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";
import type { UpgradeRunResult } from "../../src/cli/commands/upgrade.js";
import {
	UpgradeError,
	checkJsonOutcome,
	runUpgrade,
	upgradeJsonOutcome,
	validateJsonMode,
} from "../../src/cli/commands/upgrade.js";
import { makeWorkspaceResolver } from "../../src/cli/workspace-resolve.js";
import { makeStubResolver } from "./utils/stub-resolver.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/workspace-next/", import.meta.url));

/** A config mixing a workspace-sourced entry with a plain registry entry. */
const MIXED = (workspaceRange: string) => `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: {
  effected: {
   packages: {
    "@fix/bumped": { range: "${workspaceRange}", source: "workspace" },
   },
  },
  silk: {
   packages: {
    typescript: "^5.9.0",
   },
  },
 },
});
`;

const registry = makeStubResolver({ versions: { typescript: ["5.9.0", "5.9.3", "6.0.0"] } });
const workspaceResolver = makeWorkspaceResolver(FIXTURE);

const runCheck = (source: string, resolver = registry): Promise<Result.Result<UpgradeRunResult, UpgradeError>> =>
	Effect.runPromise(
		runUpgrade({ file: writeTmpConfig(source), resolver, workspaceResolver, dryRun: true }).pipe(Effect.result),
	);

/** Parse the captured stdout as ONE JSON document and pin that it is the ONLY output. */
const parseOnlyJson = (stdout: string): unknown => {
	const parsed: unknown = JSON.parse(stdout);
	// Single-line JSON.stringify plus a trailing newline, and nothing else.
	expect(stdout).toBe(`${JSON.stringify(parsed)}\n`);
	return parsed;
};

describe("checkJsonOutcome", () => {
	it("emits an in-sync document with exit 0 and an empty stderr", async () => {
		const result = await runCheck(MIXED("^0.3.0"), makeStubResolver({ versions: { typescript: ["5.9.0"] } }));
		const out = checkJsonOutcome(result);
		expect(parseOnlyJson(out.stdout)).toEqual({ command: "check", inSync: true, drift: [] });
		expect(out.exitCode).toBe(0);
		expect(out.stderr).toBe("");
	});

	it("emits mixed workspace and registry drift rows with from/to/source", async () => {
		const result = await runCheck(MIXED("^0.2.0"));
		const out = checkJsonOutcome(result);
		expect(parseOnlyJson(out.stdout)).toEqual({
			command: "check",
			inSync: false,
			drift: [
				{ catalog: "effected", pkg: "@fix/bumped", from: "^0.2.0", to: "^0.3.0", source: "workspace" },
				{ catalog: "silk", pkg: "typescript", from: "^5.9.0", to: "^5.9.3", source: "registry" },
			],
		});
		expect(out.exitCode).toBe(1);
		expect(out.stderr).toBe("");
	});

	it("emits an error document on stdout for a resolution failure, with the human message on stderr", async () => {
		const source = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { silk: { packages: { "@fix/typo": "^1.0.0" } } } });
`;
		const result = await runCheck(source, makeStubResolver({ versions: {} }));
		const out = checkJsonOutcome(result);
		const doc = parseOnlyJson(out.stdout) as {
			command: string;
			inSync: boolean;
			error: { kind: string; message: string };
		};
		expect(doc.command).toBe("check");
		expect(doc.inSync).toBe(false);
		expect(doc.error.kind).toBe("resolution");
		expect(doc.error.message).toContain("Could not resolve");
		expect(doc.error.message).toContain("@fix/typo");
		// A bash gate must never get exit 1 and an empty stdout in JSON mode.
		expect(out.exitCode).toBe(1);
		// The human-facing failure family label stays available on stderr.
		expect(out.stderr).toContain("resolution error, not drift");
	});
});

describe("upgradeJsonOutcome", () => {
	it("emits applied:false with the changed rows under --dry-run", async () => {
		const result = await runCheck(MIXED("^0.2.0"));
		const out = upgradeJsonOutcome(result, true);
		expect(parseOnlyJson(out.stdout)).toEqual({
			command: "upgrade",
			applied: false,
			updated: 2,
			changed: [
				{ catalog: "effected", pkg: "@fix/bumped", from: "^0.2.0", to: "^0.3.0", source: "workspace" },
				{ catalog: "silk", pkg: "typescript", from: "^5.9.0", to: "^5.9.3", source: "registry" },
			],
			skipped: [],
			conflicts: [],
		});
		expect(out.exitCode).toBe(0);
		expect(out.stderr).toBe("");
	});

	it("emits applied:true after a real write under --yes", async () => {
		const file = writeTmpConfig(MIXED("^0.2.0"));
		const result = await Effect.runPromise(
			runUpgrade({ file, resolver: registry, workspaceResolver }).pipe(Effect.result),
		);
		const out = upgradeJsonOutcome(result, false);
		const doc = parseOnlyJson(out.stdout) as { applied: boolean; changed: unknown[] };
		expect(doc.applied).toBe(true);
		expect(doc.changed).toHaveLength(2);
		expect(readFileSync(file, "utf8")).toContain('"@fix/bumped": { range: "^0.3.0", source: "workspace" }');
	});

	it("reports applied:false on an already-in-sync --yes run", async () => {
		const synced = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: {
  effected: { packages: { "@fix/bumped": { range: "^0.3.0", source: "workspace" } } },
  silk: { packages: { typescript: "^5.9.3" } },
 },
});
`;
		const file = writeTmpConfig(synced);
		const before = readFileSync(file, "utf8");
		const result = await Effect.runPromise(
			runUpgrade({ file, resolver: registry, workspaceResolver }).pipe(Effect.result),
		);
		const out = upgradeJsonOutcome(result, false);
		const doc = parseOnlyJson(out.stdout) as { applied: boolean; updated: number; changed: unknown[] };
		// Nothing was written, so a bash consumer keying on .applied must not
		// read this no-op run as a real apply.
		expect(doc.applied).toBe(false);
		expect(doc.updated).toBe(0);
		expect(doc.changed).toEqual([]);
		expect(out.exitCode).toBe(0);
		expect(readFileSync(file, "utf8")).toBe(before);
	});

	it("labels a peer-strategy refusal distinctly from a resolution failure", () => {
		const failure = Result.fail(
			new UpgradeError({
				message: "Refusing to apply with an incompatible peer strategy:\n  @fix/bumped",
				kind: "peer-strategy",
			}),
		);
		const upgradeDoc = parseOnlyJson(upgradeJsonOutcome(failure, false).stdout) as { error: { kind: string } };
		expect(upgradeDoc.error.kind).toBe("peer-strategy");
		const checkDoc = parseOnlyJson(checkJsonOutcome(failure).stdout) as { error: { kind: string } };
		expect(checkDoc.error.kind).toBe("peer-strategy");
	});

	it("emits an error document with a non-zero exit on failure", async () => {
		const source = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { silk: { packages: { "@fix/typo": "^1.0.0" } } } });
`;
		const result = await runCheck(source, makeStubResolver({ versions: {} }));
		const out = upgradeJsonOutcome(result, false);
		const doc = parseOnlyJson(out.stdout) as { command: string; applied: boolean; error: { kind: string } };
		expect(doc.command).toBe("upgrade");
		expect(doc.applied).toBe(false);
		expect(doc.error.kind).toBe("resolution");
		expect(out.exitCode).toBe(1);
		expect(out.stderr).not.toBe("");
	});
});

describe("validateJsonMode", () => {
	it("rejects --json on the interactive path with a clear message", () => {
		const err = validateJsonMode({ json: true, check: false, yes: false, dryRun: false, preview: false });
		expect(err).toBeInstanceOf(UpgradeError);
		expect(err?.message).toBe("--json requires a non-interactive mode: combine it with --check, --yes, or --dry-run");
	});

	it("rejects --json with --preview", () => {
		const err = validateJsonMode({ json: true, check: false, yes: false, dryRun: false, preview: true });
		expect(err).toBeInstanceOf(UpgradeError);
		expect(err?.message).toContain("--preview");
	});

	it("accepts --json with each non-interactive mode and is inert without --json", () => {
		expect(validateJsonMode({ json: true, check: true, yes: false, dryRun: false, preview: false })).toBeNull();
		expect(validateJsonMode({ json: true, check: false, yes: true, dryRun: false, preview: false })).toBeNull();
		expect(validateJsonMode({ json: true, check: false, yes: false, dryRun: true, preview: false })).toBeNull();
		expect(validateJsonMode({ json: false, check: false, yes: false, dryRun: false, preview: false })).toBeNull();
	});
});
