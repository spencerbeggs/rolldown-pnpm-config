import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { applyDecisions, resolveTargetFile, resolveVersions, runUpgrade } from "../../src/cli/commands/upgrade.js";
import { discoverCatalogEntries } from "../../src/cli/discover.js";
import { buildWalkItems } from "../../src/cli/walk-plan.js";
import type { Decision } from "../../src/cli/walk-types.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  typescript: "^5.9.0",
  vitest: { range: "^4.0.0", peer: "^4.0.0", strategy: "lock-minor" },
 } } },
});
`;

const DRIFT_SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  vitest: { range: "^4.2.3", peer: "^4.1.0", strategy: "lock-minor" },
 } } },
});
`;

const resolver = {
	versions: (pkg: string) => Effect.succeed(pkg === "typescript" ? ["5.9.0", "5.9.3", "7.1.0"] : ["4.0.0", "4.2.3"]),
};

const driftResolver = {
	versions: (_pkg: string) => Effect.succeed(["4.2.3"]),
};

describe("interactive apply (headless)", () => {
	it("applies chosen decisions to the file, range + recomputed peer", async () => {
		const file = writeTmpConfig(SOURCE);
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const source = readFileSync(file, "utf8");
				const { entries } = discoverCatalogEntries(source, file);
				const versions = yield* resolveVersions(entries, resolver);
				const items = yield* buildWalkItems(entries, versions);
				// Simulate: choose the in-range candidate for every actionable item.
				const decisions: Decision[] = items
					.filter((i) => !i.upToDate)
					.map((i) => ({ item: i, chosen: i.candidates.find((c) => c.kind === "in-range")! }));
				return yield* applyDecisions(file, source, decisions);
			}),
		);
		const out = readFileSync(file, "utf8");
		expect(out).toContain('typescript: "^5.9.3"');
		expect(out).toContain('range: "^4.2.3"');
		expect(out).toContain('peer: "^4.2.0"');
		expect(result).toBe(2);
	});

	it("materializes a new peer literal when strategy is set but no peer exists", async () => {
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  typescript: { range: "^5.9.0", strategy: "lock-minor" },
 } } },
});
`;
		const file = writeTmpConfig(SOURCE);
		const resolver = { versions: () => Effect.succeed(["5.9.0", "5.9.3"]) };
		const out = await Effect.runPromise(
			Effect.gen(function* () {
				const source = readFileSync(file, "utf8");
				const { entries } = discoverCatalogEntries(source, file);
				const versions = yield* resolveVersions(entries, resolver);
				const items = yield* buildWalkItems(entries, versions);
				const decisions: Decision[] = items
					.filter((i) => !i.upToDate)
					.map((i) => ({ item: i, chosen: i.candidates.find((c) => c.kind === "in-range") ?? i.candidates[0] }));
				return yield* applyDecisions(file, source, decisions);
			}),
		);
		const result = readFileSync(file, "utf8");
		expect(result).toContain('range: "^5.9.3"');
		expect(result).toContain('peer: "^5.9.0"'); // peer from in-range candidate: lock-minor(5.9.3) → ^5.9.0
		expect(out).toBeGreaterThanOrEqual(1);
	});

	it("resyncs drifted peer even when range is already at newest version", async () => {
		const file = writeTmpConfig(DRIFT_SOURCE);
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const source = readFileSync(file, "utf8");
				const { entries } = discoverCatalogEntries(source, file);
				const versions = yield* resolveVersions(entries, driftResolver);
				const items = yield* buildWalkItems(entries, versions);
				// Drifted item must be actionable (not up-to-date) despite being newest.
				const vitestItem = items.find((i) => i.entry.pkg === "vitest")!;
				expect(vitestItem.upToDate).toBe(false);
				// Simulate: keep the range (only candidate available), let drift resync run.
				const decisions: Decision[] = items
					.filter((i) => !i.upToDate)
					.map((i) => ({ item: i, chosen: i.candidates.find((c) => c.kind === "keep")! }));
				return yield* applyDecisions(file, source, decisions);
			}),
		);
		const out = readFileSync(file, "utf8");
		// Range must be unchanged.
		expect(out).toContain('range: "^4.2.3"');
		// Peer must be resynced to lock-minor of 4.2.3.
		expect(out).toContain('peer: "^4.2.0"');
		// applyDecisions must count the resync as a change.
		expect(result).toBe(1);
	});
});

describe("runUpgrade --yes path", () => {
	it("materializes a peer under --yes even when the package is already at its newest version", async () => {
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 catalogs: { silk: { packages: {
  typescript: { range: "^5.9.0", strategy: "lock-minor" },
 } } },
});
`;
		const file = writeTmpConfig(SOURCE);
		const resolver = { versions: () => Effect.succeed(["5.9.0"]) }; // already newest, no upgrade
		const result = await Effect.runPromise(runUpgrade({ file, resolver }));
		const out = readFileSync(file, "utf8");
		expect(out).toContain('range: "^5.9.0"'); // range unchanged
		expect(out).toContain('peer: "^5.9.0"'); // peer materialized (lock-minor of 5.9.0)
		expect(result.updated).toBe(1);
	});
});

describe("resolveTargetFile autodetect", () => {
	it("autodetects the single config file when no path is given", async () => {
		const dir = mkdtempSync(join(tmpdir(), "rpc-auto-"));
		writeFileSync(
			join(dir, "savvy.build.ts"),
			`import { PnpmConfigPlugin } from "rolldown-pnpm-config";\nexport const p = PnpmConfigPlugin({ catalogs: { silk: { packages: { typescript: "^5.9.0" } } } });\n`,
			"utf8",
		);
		const prev = process.cwd();
		try {
			process.chdir(dir);
			const file = await Effect.runPromise(resolveTargetFile(Option.none()));
			expect(file.endsWith("savvy.build.ts")).toBe(true);
		} finally {
			process.chdir(prev);
		}
	});
});
