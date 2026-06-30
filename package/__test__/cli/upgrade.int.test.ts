import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runUpgrade, runUpgradePreview } from "../../src/cli/commands/upgrade.js";
import { makeStubResolver } from "./utils/stub-resolver.js";
import { writeTmpConfig } from "./utils/tmp-config.js";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 catalogs: {
  silk: {
   packages: {
    typescript: "^5.9.0",
    vitest: { range: "^4.0.0", peer: "^4.0.0", strategy: "lock-minor" },
   },
  },
 },
});
`;

const resolver = makeStubResolver({
	versions: {
		typescript: ["5.9.0", "5.9.3", "6.0.0"],
		vitest: ["4.0.0", "4.2.3", "5.0.0"],
	},
});

describe("runUpgrade (non-interactive)", () => {
	it("rewrites ranges to latest-in-range and recomputes peer, never crossing a major", async () => {
		const file = writeTmpConfig(SOURCE);
		const out = await Effect.runPromise(runUpgrade({ file, resolver }));
		const result = readFileSync(file, "utf8");
		// typescript ^5.9.0 -> ^5.9.3 (not 6.0.0)
		expect(result).toContain('typescript: "^5.9.3"');
		// vitest range ^4.0.0 -> ^4.2.3, peer recomputed via lock-minor -> ^4.2.0
		expect(result).toContain('range: "^4.2.3"');
		expect(result).toContain('peer: "^4.2.0"');
		expect(result).not.toContain("6.0.0");
		expect(out.updated).toBe(2);
	});
});

describe("runUpgrade (release-age gate)", () => {
	const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 name: "@test/cfg",
 minimumReleaseAge: 1440,
 catalogs: { silk: { packages: { typescript: "^5.9.0" } } },
});
`;
	const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

	it("never proposes a version younger than minimumReleaseAge", async () => {
		const file = writeTmpConfig(CONFIG);
		const resolver = makeStubResolver({
			versions: { typescript: ["5.9.0", "5.9.3"] },
			// 5.9.3 published 1 minute ago → blocked by the 1440-minute gate; 5.9.0 is old
			times: { typescript: { "5.9.0": iso(30 * 86_400_000), "5.9.3": iso(60_000) } },
		});
		const out = await Effect.runPromise(runUpgrade({ file, resolver }));
		const result = readFileSync(file, "utf8");
		expect(result).toContain('typescript: "^5.9.0"'); // unchanged — 5.9.3 is too young
		expect(out.updated).toBe(0);
	});
});

describe("runUpgrade (interop)", () => {
	const SRC = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { effect: { packages: {
 effect: { range: "^3.16.0", strategy: "interop" },
 "@effect/cli": { range: "^0.70.0", strategy: "interop" },
} } } });
`;
	it("downgrades a dependent and materializes caret peers", async () => {
		const file = writeTmpConfig(SRC);
		const resolver = makeStubResolver({
			versions: { effect: ["3.16.0", "3.17.0"], "@effect/cli": ["0.70.0", "0.71.0"] },
			peerDependencies: {
				effect: { "3.16.0": {}, "3.17.0": {} },
				"@effect/cli": { "0.70.0": { effect: "^3.16.0" }, "0.71.0": { effect: "^3.18.0" } },
			},
		});
		const out = await Effect.runPromise(runUpgrade({ file, resolver }));
		const result = readFileSync(file, "utf8");
		expect(result).toContain('effect: { range: "^3.17.0"'); // effect bumped in-range
		expect(result).toContain('"@effect/cli": { range: "^0.70.0"'); // cli held — 0.71 needs effect ^3.18
		expect(result).toContain('peer: "^3.16.0"'); // effect peer floor from cli@0.70
		expect(out.conflicts).toEqual([]);
	});
});

describe("runUpgradePreview", () => {
	it("projects in-range bumps without writing", async () => {
		const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { silk: { packages: { typescript: "^5.9.0" } } } });
`;
		const file = writeTmpConfig(SOURCE);
		const resolver = makeStubResolver({ versions: { typescript: ["5.9.0", "5.9.3"] } });
		const before = readFileSync(file, "utf8");
		const out = await Effect.runPromise(runUpgradePreview({ file, resolver, full: false }));
		expect(out).toContain("typescript");
		expect(out).toContain("→");
		expect(readFileSync(file, "utf8")).toBe(before);
	});
});
