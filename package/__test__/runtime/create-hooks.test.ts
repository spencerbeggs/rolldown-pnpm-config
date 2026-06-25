import { describe, expect, it } from "vitest";
import { createHooks } from "../../src/runtime/index.js";

const catalogsManifest = { catalogs: { strategy: "catalogs", enforcement: "warn" as const } };

describe("createHooks", () => {
	it("merges frozen catalogs into config; local entries win per package", () => {
		const hooks = createHooks({ catalogs: { silk: { a: "1.0.0", b: "2.0.0" } } }, catalogsManifest);
		const result = hooks.updateConfig({ catalogs: { silk: { b: "9.9.9", c: "3.0.0" } } });
		expect(result.catalogs).toEqual({ silk: { a: "1.0.0", b: "9.9.9", c: "3.0.0" } });
	});

	it("adds a frozen catalog absent from local config", () => {
		const hooks = createHooks({ catalogs: { silk: { a: "1.0.0" } } }, catalogsManifest);
		const result = hooks.updateConfig({});
		expect(result.catalogs).toEqual({ silk: { a: "1.0.0" } });
	});

	it("preserves unrelated config fields", () => {
		const hooks = createHooks({ catalogs: {} }, catalogsManifest);
		const result = hooks.updateConfig({ minimumReleaseAge: 1440 });
		expect(result.minimumReleaseAge).toBe(1440);
	});
});
