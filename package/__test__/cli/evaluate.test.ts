import { describe, expect, it } from "vitest";
import { evaluatePluginConfig } from "../../src/cli/evaluate.js";

const SOURCE = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({
 local: { publicHoistPattern: ["@override/*"] },
 catalogs: { silk: { packages: { typescript: { range: "^5.9.0", peer: "^5.9.0", strategy: "lock-minor" } } } },
 overrides: { "tar@<6.2.1": ">=6.2.1" },
 publicHoistPattern: ["@types/*"],
 strictDepBuilds: true,
 minimumReleaseAge: { value: 1440, enforcement: "warn" },
 confirmModulesPurge: false,
});
`;

describe("evaluatePluginConfig", () => {
	it("evaluates a literal config into a plain object", () => {
		const { config, errors } = evaluatePluginConfig(SOURCE, "savvy.build.ts");
		expect(errors).toEqual([]);
		expect(config).toEqual({
			local: { publicHoistPattern: ["@override/*"] },
			catalogs: { silk: { packages: { typescript: { range: "^5.9.0", peer: "^5.9.0", strategy: "lock-minor" } } } },
			overrides: { "tar@<6.2.1": ">=6.2.1" },
			publicHoistPattern: ["@types/*"],
			strictDepBuilds: true,
			minimumReleaseAge: { value: 1440, enforcement: "warn" },
			confirmModulesPurge: false,
		});
	});

	it("reports a computed value as an error and omits it", () => {
		const src = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
const x = ["@types/*"];
export const p = PnpmConfigPlugin({ catalogs: {}, publicHoistPattern: x });`;
		const { config, errors } = evaluatePluginConfig(src, "x.ts");
		expect(config).toMatchObject({ catalogs: {} });
		expect((config as Record<string, unknown>).publicHoistPattern).toBeUndefined();
		expect(errors.some((e) => e.includes("publicHoistPattern"))).toBe(true);
	});

	it("returns null config when there is no PnpmConfigPlugin call", () => {
		const { config } = evaluatePluginConfig("export const x = 1;", "x.ts");
		expect(config).toBeNull();
	});

	it("omits a non-literal array element and reports it", () => {
		const src = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
const x = "@types/*";
export const p = PnpmConfigPlugin({ catalogs: {}, publicHoistPattern: [x] });`;
		const { config, errors } = evaluatePluginConfig(src, "x.ts");
		expect((config as Record<string, unknown>).publicHoistPattern).toEqual([]);
		expect(errors.some((e) => e.includes("publicHoistPattern[0]"))).toBe(true);
	});

	it("returns a null config and the oxc errors on a parse failure", () => {
		const { config, errors } = evaluatePluginConfig("const x = = = ;", "bad.ts");
		expect(config).toBeNull();
		expect(errors.length).toBeGreaterThan(0);
	});
});
