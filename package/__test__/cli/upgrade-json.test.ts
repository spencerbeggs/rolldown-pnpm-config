import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import { CliDoc } from "@effected/cli";
import { Effect, Result, Runtime } from "effect";
import {
	CheckFailedError,
	UpgradeError,
	UpgradeUsageError,
	checkJsonOutcome,
	runUpgrade,
	upgradeJsonOutcome,
	validateFormatMode,
} from "../../src/cli/commands/upgrade.js";
import { EXIT_CODES } from "../../src/cli/exit-codes.js";
import { makeWorkspaceResolver } from "../../src/cli/workspace-resolve.js";
import { plainText } from "./utils/doc.js";
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

const runCheck = (source: string, resolver = registry) =>
	runUpgrade({ file: writeTmpConfig(source), resolver, workspaceResolver, dryRun: true }).pipe(Effect.result);

/**
 * The data a JSON document is printed from. `CliFormat.print` serializes it on
 * one line (the bin e2e pins the bytes on stdout); here it must survive a JSON
 * round-trip unchanged, so nothing in it is a value JSON cannot hold.
 */
const parseOnlyJson = (data: unknown): unknown => {
	const roundTripped: unknown = JSON.parse(JSON.stringify(data));
	expect(roundTripped).toEqual(data);
	return roundTripped;
};

describe("checkJsonOutcome", () => {
	it.effect("emits an in-sync document with exit 0 and no failure", () =>
		Effect.gen(function* () {
			const result = yield* runCheck(MIXED("^0.3.0"), makeStubResolver({ versions: { typescript: ["5.9.0"] } }));
			const out = checkJsonOutcome(result);
			expect(parseOnlyJson(out.data)).toEqual({ command: "check", inSync: true, drift: [] });
			expect(out.exitCode).toBe(0);
			expect(out.failure).toBeUndefined();
		}),
	);

	it.effect("emits mixed workspace and registry drift rows with from/to/source", () =>
		Effect.gen(function* () {
			const result = yield* runCheck(MIXED("^0.2.0"));
			const out = checkJsonOutcome(result);
			expect(parseOnlyJson(out.data)).toEqual({
				command: "check",
				inSync: false,
				drift: [
					{ catalog: "effected", pkg: "@fix/bumped", from: "^0.2.0", to: "^0.3.0", source: "workspace" },
					{ catalog: "silk", pkg: "typescript", from: "^5.9.0", to: "^5.9.3", source: "registry" },
				],
			});
			expect(out.exitCode).toBe(1);
			expect(out.failure).toBeUndefined();
		}),
	);

	it.effect("emits an error document on stdout for a resolution failure, with the human message on stderr", () =>
		Effect.gen(function* () {
			const source = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { silk: { packages: { "@fix/typo": "^1.0.0" } } } });
`;
			const result = yield* runCheck(source, makeStubResolver({ versions: {} }));
			const out = checkJsonOutcome(result);
			const doc = parseOnlyJson(out.data) as {
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
			// The command fails with this, so the labelled human report lands on stderr.
			expect(out.failure).toBeInstanceOf(CheckFailedError);
			expect(out.failure === undefined ? "" : plainText(out.failure[CliDoc]())).toContain(
				"resolution error, not drift",
			);
		}),
	);
});

describe("upgradeJsonOutcome", () => {
	it.effect("emits applied:false with the changed rows under --dry-run", () =>
		Effect.gen(function* () {
			const result = yield* runCheck(MIXED("^0.2.0"));
			const out = upgradeJsonOutcome(result, true);
			expect(parseOnlyJson(out.data)).toEqual({
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
			expect(out.failure).toBeUndefined();
		}),
	);

	it.effect("emits applied:true after a real write under --yes", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(MIXED("^0.2.0"));
			const result = yield* runUpgrade({ file, resolver: registry, workspaceResolver }).pipe(Effect.result);
			const out = upgradeJsonOutcome(result, false);
			const doc = parseOnlyJson(out.data) as { applied: boolean; changed: unknown[] };
			expect(doc.applied).toBe(true);
			expect(doc.changed).toHaveLength(2);
			expect(readFileSync(file, "utf8")).toContain('"@fix/bumped": { range: "^0.3.0", source: "workspace" }');
		}),
	);

	it.effect("reports applied:false on an already-in-sync --yes run", () =>
		Effect.gen(function* () {
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
			const result = yield* runUpgrade({ file, resolver: registry, workspaceResolver }).pipe(Effect.result);
			const out = upgradeJsonOutcome(result, false);
			const doc = parseOnlyJson(out.data) as { applied: boolean; updated: number; changed: unknown[] };
			// Nothing was written, so a bash consumer keying on .applied must not
			// read this no-op run as a real apply.
			expect(doc.applied).toBe(false);
			expect(doc.updated).toBe(0);
			expect(doc.changed).toEqual([]);
			expect(out.failure).toBeUndefined();
			expect(readFileSync(file, "utf8")).toBe(before);
		}),
	);

	it("labels a peer-strategy refusal distinctly from a resolution failure", () => {
		const failure = Result.fail(
			new UpgradeError({
				message: "Refusing to apply with an incompatible peer strategy:\n  @fix/bumped",
				kind: "peer-strategy",
			}),
		);
		const upgradeDoc = parseOnlyJson(upgradeJsonOutcome(failure, false).data) as { error: { kind: string } };
		expect(upgradeDoc.error.kind).toBe("peer-strategy");
		const checkDoc = parseOnlyJson(checkJsonOutcome(failure).data) as { error: { kind: string } };
		expect(checkDoc.error.kind).toBe("peer-strategy");
	});

	it.effect("emits an error document with a non-zero exit on failure", () =>
		Effect.gen(function* () {
			const source = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { silk: { packages: { "@fix/typo": "^1.0.0" } } } });
`;
			const result = yield* runCheck(source, makeStubResolver({ versions: {} }));
			const out = upgradeJsonOutcome(result, false);
			const doc = parseOnlyJson(out.data) as { command: string; applied: boolean; error: { kind: string } };
			expect(doc.command).toBe("upgrade");
			expect(doc.applied).toBe(false);
			expect(doc.error.kind).toBe("resolution");
			// The command fails with the error, so the exit is non-zero and the message is on stderr.
			expect(out.failure).toBeInstanceOf(UpgradeError);
		}),
	);
});

describe("validateFormatMode", () => {
	it("rejects --format json on the interactive path with a clear message", () => {
		const err = validateFormatMode({ format: "json", check: false, yes: false, dryRun: false, preview: false });
		expect(err).toBeInstanceOf(UpgradeUsageError);
		// A usage error, so it exits 64 rather than a resolution failure's 1 — mapped
		// by tag through CliRuntime.main's exitCodes, not marked on the error itself.
		expect(err === null ? undefined : EXIT_CODES[err._tag]).toBe(64);
		expect(err !== null && Runtime.errorExitCode in err).toBe(false);
		expect(err?.message).toBe(
			"--format json requires a non-interactive mode: combine it with --check, --yes, or --dry-run",
		);
	});

	it("rejects --format json with --preview", () => {
		const err = validateFormatMode({ format: "json", check: false, yes: false, dryRun: false, preview: true });
		expect(err).toBeInstanceOf(UpgradeUsageError);
		expect(err?.message).toContain("--preview");
	});

	it("accepts --format json with each non-interactive mode and is inert under auto", () => {
		expect(validateFormatMode({ format: "json", check: true, yes: false, dryRun: false, preview: false })).toBeNull();
		expect(validateFormatMode({ format: "json", check: false, yes: true, dryRun: false, preview: false })).toBeNull();
		expect(validateFormatMode({ format: "json", check: false, yes: false, dryRun: true, preview: false })).toBeNull();
		expect(validateFormatMode({ format: "auto", check: false, yes: false, dryRun: false, preview: false })).toBeNull();
	});
});
