import { describe, expect, it } from "vitest";
import { allowBuilds } from "../../../src/runtime/strategies/maps.js";
import { securityFlag, securityMin } from "../../../src/runtime/strategies/scalar.js";

const ctx = { rootName: undefined };

describe("securityFlag", () => {
	it("flags loosening when child disables a silk-enabled flag", () => {
		const r = securityFlag(true, false, ctx);
		expect(r.merged).toBe(false);
		expect(r.divergences[0]).toMatchObject({ setting: "", localValue: "false", kind: "security" });
	});
	it("no flag when child keeps it enabled or absent", () => {
		expect(securityFlag(true, undefined, ctx).divergences).toEqual([]);
		expect(securityFlag(true, true, ctx).divergences).toEqual([]);
	});
});

describe("securityMin", () => {
	it("flags loosening when child lowers the value", () => {
		const r = securityMin(1440, 60, ctx);
		expect(r.merged).toBe(60);
		expect(r.divergences[0]).toMatchObject({ kind: "security" });
	});
	it("no flag when child raises or matches", () => {
		expect(securityMin(1440, 2880, ctx).divergences).toEqual([]);
	});
});

describe("allowBuilds", () => {
	it("flags enabling a build silk blocked", () => {
		const r = allowBuilds({ esbuild: false }, { esbuild: true }, ctx);
		expect(r.merged).toEqual({ esbuild: true });
		expect(r.divergences[0]).toMatchObject({ setting: "allowBuilds.esbuild", kind: "security" });
	});
});
