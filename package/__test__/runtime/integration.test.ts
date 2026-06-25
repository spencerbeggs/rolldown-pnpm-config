import { afterEach, describe, expect, it, vi } from "vitest";
import { createHooks } from "../../src/runtime/index.js";

const base = {
	catalogs: { silk: { typescript: "^5.9.0" } },
	overrides: { "tar@<1": ">=1" },
	strictDepBuilds: true,
	minimumReleaseAge: 1440,
	publicHoistPattern: ["@types/*"],
	confirmModulesPurge: true,
};
const manifest = {
	catalogs: { strategy: "catalogs", enforcement: "warn" as const },
	overrides: { strategy: "overrides", enforcement: "warn" as const },
	strictDepBuilds: { strategy: "securityFlag", enforcement: "warn" as const },
	minimumReleaseAge: { strategy: "securityMin", enforcement: "warn" as const },
	publicHoistPattern: { strategy: "arrayUnion", enforcement: "absent" as const },
	confirmModulesPurge: { strategy: "scalar", enforcement: "absent" as const },
};

afterEach(() => vi.restoreAllMocks());

describe("createHooks full integration", () => {
	it("merges all fields, child-wins, and warns on override + security loosening", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const out = createHooks(base, manifest).updateConfig({
			catalogs: { silk: { typescript: "5.0.0" } },
			strictDepBuilds: false,
			publicHoistPattern: ["lodash"],
		});
		expect(out.catalogs).toEqual({ silk: { typescript: "5.0.0" } });
		expect(out.strictDepBuilds).toBe(false);
		expect(out.publicHoistPattern).toEqual(["@types/*", "lodash"]);
		expect(out.confirmModulesPurge).toBe(true);
		const printed = warn.mock.calls.map((c) => String(c[0])).join("\n");
		expect(printed).toContain("SILK CATALOG OVERRIDE DETECTED");
		expect(printed).toContain("SILK SECURITY OVERRIDE DETECTED");
		expect(printed).toContain("strictDepBuilds");
	});
});
