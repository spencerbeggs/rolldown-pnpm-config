import { describe, expect, it } from "vitest";
import { emitCatalogsModule, emitPnpmfileModule, sortKeys } from "../../src/plugin/serialize.js";

describe("sortKeys", () => {
	it("recursively sorts object keys; arrays keep order", () => {
		expect(sortKeys({ b: 1, a: { d: 2, c: 3 } })).toEqual({ a: { c: 3, d: 2 }, b: 1 });
		expect(sortKeys([3, 1, 2])).toEqual([3, 1, 2]);
	});
});

describe("emitCatalogsModule", () => {
	it("emits a sorted Map literal (plain-JS branch)", () => {
		const src = emitCatalogsModule({ peers: { z: "2" }, default: { b: "1", a: "9" } });
		expect(src).toBe(
			'export const catalogs = new Map([["default", new Map([["a", "9"], ["b", "1"]])], ["peers", new Map([["z", "2"]])]]);\n',
		);
	});
});

describe("emitPnpmfileModule", () => {
	it("emits createHooks wiring over base + manifest + name (plain-JS branch)", () => {
		const src = emitPnpmfileModule(
			{ catalogs: { default: { a: "1" } } },
			{ catalogs: { strategy: "catalogs", enforcement: "warn" } },
			"@acme/cfg",
		);
		expect(src).toContain('import { createHooks } from "rolldown-pnpm-config/runtime";');
		expect(src).not.toContain("import type");
		expect(src).toContain(
			'export const hooks = createHooks({"catalogs":{"default":{"a":"1"}}}, {"catalogs":{"enforcement":"warn","strategy":"catalogs"}}, "@acme/cfg");',
		);
	});

	it("includes the name as a JSON string literal in the emitted source", () => {
		const src = emitPnpmfileModule({}, {}, "@acme/cfg");
		expect(src).toContain("createHooks(");
		expect(src).toContain('"@acme/cfg")');
	});
});
