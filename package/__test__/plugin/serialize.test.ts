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
		const src = emitCatalogsModule({ silkPeers: { z: "2" }, silk: { b: "1", a: "9" } });
		expect(src).toBe(
			'export const catalogs = new Map([["silk", new Map([["a", "9"], ["b", "1"]])], ["silkPeers", new Map([["z", "2"]])]]);\n',
		);
	});
});

describe("emitPnpmfileModule", () => {
	it("emits createHooks wiring over base + manifest (plain-JS branch)", () => {
		const src = emitPnpmfileModule(
			{ catalogs: { silk: { a: "1" } } },
			{ catalogs: { strategy: "catalogs", enforcement: "warn" } },
		);
		expect(src).toContain('import { createHooks } from "rolldown-pnpm-config/runtime";');
		expect(src).not.toContain("import type");
		expect(src).toContain(
			'export const hooks = createHooks({"catalogs":{"silk":{"a":"1"}}}, {"catalogs":{"enforcement":"warn","strategy":"catalogs"}});',
		);
	});
});
