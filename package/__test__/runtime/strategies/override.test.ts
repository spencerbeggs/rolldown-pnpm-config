import { describe, expect, it } from "vitest";
import { catalogs } from "../../../src/runtime/strategies/catalogs.js";
import { overrides } from "../../../src/runtime/strategies/overrides.js";

const ctx = { rootName: undefined };

describe("catalogs override detection", () => {
	it("emits an override divergence when local differs from silk", () => {
		const r = catalogs({ silk: { a: "1.0.0" } }, { silk: { a: "2.0.0" } }, ctx);
		expect(r.divergences).toHaveLength(1);
		expect(r.divergences[0]).toMatchObject({
			setting: "catalogs.silk.a",
			silkValue: "1.0.0",
			childValue: "2.0.0",
			kind: "override",
		});
	});
	it("no divergence when local matches or is absent", () => {
		expect(catalogs({ silk: { a: "1.0.0" } }, { silk: { a: "1.0.0" } }, ctx).divergences).toEqual([]);
	});
});

describe("overrides strategy", () => {
	it("child wins, emits override divergence on conflict", () => {
		const r = overrides({ "tar@<1": ">=1" }, { "tar@<1": ">=2" }, ctx);
		expect(r.merged).toEqual({ "tar@<1": ">=2" });
		expect(r.divergences[0]).toMatchObject({ setting: "overrides.tar@<1", kind: "override" });
	});
});
