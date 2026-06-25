import { describe, expect, it } from "vitest";
import { createHooks } from "../../src/runtime/index.js";

describe("createHooks engine", () => {
	it("merges catalogs via the catalogs strategy (M1 parity)", () => {
		const base = { catalogs: { silk: { a: "1.0.0", b: "2.0.0" } } };
		const manifest = { catalogs: { strategy: "catalogs", enforcement: "warn" as const } };
		const out = createHooks(base, manifest).updateConfig({ catalogs: { silk: { b: "9.9.9", c: "3.0.0" } } });
		expect(out.catalogs).toEqual({ silk: { a: "1.0.0", b: "9.9.9", c: "3.0.0" } });
	});

	it("applies a quiet scalar field (confirmModulesPurge) silently, child wins", () => {
		const base = { confirmModulesPurge: true };
		const manifest = { confirmModulesPurge: { strategy: "scalar", enforcement: "absent" as const } };
		expect(createHooks(base, manifest).updateConfig({}).confirmModulesPurge).toBe(true);
		expect(createHooks(base, manifest).updateConfig({ confirmModulesPurge: false }).confirmModulesPurge).toBe(false);
	});

	it("omits a field whose merged value is undefined/empty", () => {
		const out = createHooks({}, {}).updateConfig({ dir: "/x" });
		expect(out.dir).toBe("/x");
	});

	it("applies the excludeByRepo refine from manifest options against the resolved root name", () => {
		const base = { publicHoistPattern: ["@x/cli", "@types/*"] };
		const manifest = {
			publicHoistPattern: {
				strategy: "arrayUnion",
				enforcement: "absent" as const,
				options: { excludeByRepo: { "x-repo": ["@x/cli"] } },
			},
		};
		const out = createHooks(base, manifest).updateConfig({ rootProjectManifest: { name: "x-repo" } });
		expect(out.publicHoistPattern).toEqual(["@types/*"]);
	});
});
