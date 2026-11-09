import { readFileSync } from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import { CliUiTest } from "@effected/cli-kit/ui/testing";
import { Effect, Exit } from "effect";
import { CheckFailedError, UpgradeError } from "../../src/cli/commands/upgrade.js";
import { discoverCatalogEntries } from "../../src/cli/discover.js";
import { failureOf, runUpgradeCommand } from "./utils/run-upgrade.js";
import { stubResolverLayer } from "./utils/stub-resolver.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

// Two catalogs, both drifted against the stub registry: `alpha` holds
// typescript (^5.9.0 → ^5.9.3), `beta` holds vitest (^4.0.0 → ^4.1.0).
const config = (ts: string, vitest: string) => `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: {
  alpha: { packages: { typescript: "${ts}" } },
  beta: { packages: { vitest: "${vitest}" } },
  empty: { packages: {} },
 },
});
`;
const BOTH_DRIFTED = config("^5.9.0", "^4.0.0");
const ONLY_BETA_DRIFTED = config("^5.9.3", "^4.0.0");

const resolver = stubResolverLayer({ versions: { typescript: ["5.9.0", "5.9.3"], vitest: ["4.0.0", "4.1.0"] } });

const session = CliUiTest.session({ color: "none", interactive: false });
const run = (s: Effect.Success<typeof session>, args: ReadonlyArray<string>) => runUpgradeCommand(s, resolver, args);
const jsonOf = (stdout: string) => JSON.parse(stdout.trim());

describe("discoverCatalogEntries declared catalogs", () => {
	it("lists every declared catalog, including one with no entries", () => {
		expect(discoverCatalogEntries(BOTH_DRIFTED, "config.ts").catalogs).toEqual(["alpha", "beta", "empty"]);
	});
});

describe("upgrade --catalog scopes every mode", () => {
	it.effect("--check --format json reports drift only for the named catalog", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(BOTH_DRIFTED);
			const s = yield* session;
			yield* run(s, ["--check", "--catalog", "alpha", "--format", "json", file]);
			const doc = jsonOf(yield* s.stdout);
			expect(doc.inSync).toBe(false);
			expect(doc.drift.map((r: { catalog: string }) => r.catalog)).toEqual(["alpha"]);
		}),
	);

	it.effect("--check is in sync when only another catalog drifted", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(ONLY_BETA_DRIFTED);
			const s = yield* session;
			const exit = yield* run(s, ["--check", "--catalog", "alpha", "--format", "json", file]);
			expect(Exit.isSuccess(exit)).toBe(true);
			expect(jsonOf(yield* s.stdout)).toEqual({ command: "check", inSync: true, drift: [] });
		}),
	);

	it.effect("control: --check without --catalog still sees every catalog", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(BOTH_DRIFTED);
			const s = yield* session;
			yield* run(s, ["--check", "--format", "json", file]);
			const doc = jsonOf(yield* s.stdout);
			expect(doc.drift.map((r: { catalog: string }) => r.catalog)).toEqual(["alpha", "beta"]);
		}),
	);

	it.effect("--yes writes only the named catalog's entries", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(BOTH_DRIFTED);
			const s = yield* session;
			const exit = yield* run(s, ["--yes", "--catalog", "alpha", file]);
			expect(Exit.isSuccess(exit)).toBe(true);
			const written = readFileSync(file, "utf8");
			expect(written).toContain('typescript: "^5.9.3"');
			expect(written).toContain('vitest: "^4.0.0"');
		}),
	);

	it.effect("--dry-run --format json lists changed rows only for the named catalog", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(BOTH_DRIFTED);
			const s = yield* session;
			yield* run(s, ["--dry-run", "--catalog", "beta", "--format", "json", file]);
			const doc = jsonOf(yield* s.stdout);
			expect(doc.changed.map((r: { catalog: string }) => r.catalog)).toEqual(["beta"]);
			expect(readFileSync(file, "utf8")).toBe(BOTH_DRIFTED);
		}),
	);

	it.effect("--preview shows only the named catalog", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(BOTH_DRIFTED);
			const s = yield* session;
			yield* run(s, ["--preview", "--full", "--catalog", "alpha", file]);
			const stdout = yield* s.stdout;
			expect(stdout).toContain("typescript");
			expect(stdout).not.toContain("vitest");
		}),
	);

	it.effect("a declared catalog with no entries is not an error", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(BOTH_DRIFTED);
			const s = yield* session;
			const exit = yield* run(s, ["--check", "--catalog", "empty", "--format", "json", file]);
			expect(Exit.isSuccess(exit)).toBe(true);
			expect(jsonOf(yield* s.stdout)).toMatchObject({ inSync: true, drift: [] });
		}),
	);
});

describe("upgrade --catalog naming no declared catalog", () => {
	const modes: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
		["--check", ["--check"]],
		["--yes", ["--yes"]],
		["--preview", ["--preview"]],
		["the default path", []],
	];
	for (const [label, flags] of modes) {
		it.effect(`fails under ${label}, naming the declared catalogs, and writes nothing`, () =>
			Effect.gen(function* () {
				const file = writeTmpConfig(BOTH_DRIFTED);
				const s = yield* session;
				const exit = yield* run(s, [...flags, "--catalog", "gamma", file]);
				const failure = failureOf(exit);
				expect(failure instanceof UpgradeError || failure instanceof CheckFailedError).toBe(true);
				const { kind, message } = failure as UpgradeError;
				expect(kind).toBe("catalog");
				expect(message).toContain('"gamma"');
				expect(message).toContain("alpha, beta, empty");
				expect(readFileSync(file, "utf8")).toBe(BOTH_DRIFTED);
			}),
		);
	}

	it.effect("--check --format json emits an error document with error.kind catalog", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(BOTH_DRIFTED);
			const s = yield* session;
			yield* run(s, ["--check", "--catalog", "gamma", "--format", "json", file]);
			expect(jsonOf(yield* s.stdout)).toMatchObject({ command: "check", inSync: false, error: { kind: "catalog" } });
		}),
	);

	it.effect("--yes --format json emits an error document with error.kind catalog", () =>
		Effect.gen(function* () {
			const file = writeTmpConfig(BOTH_DRIFTED);
			const s = yield* session;
			yield* run(s, ["--yes", "--catalog", "gamma", "--format", "json", file]);
			expect(jsonOf(yield* s.stdout)).toMatchObject({ command: "upgrade", applied: false, error: { kind: "catalog" } });
		}),
	);
});
