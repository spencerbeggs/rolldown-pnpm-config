import { describe, expect, it } from "vitest";
import { formatOverrideWarning } from "../../src/runtime/warnings.js";

describe("formatOverrideWarning", () => {
	it("returns empty string for no divergences", () => {
		expect(formatOverrideWarning([])).toBe("");
	});
	it("renders a box containing the setting and both versions", () => {
		const box = formatOverrideWarning([
			{ setting: "catalogs.silk.a", silkValue: "1.0.0", childValue: "2.0.0", detail: "", kind: "override" },
		]);
		expect(box).toContain("SILK CATALOG OVERRIDE DETECTED");
		expect(box).toContain("catalogs.silk.a");
		expect(box).toContain("1.0.0");
		expect(box).toContain("2.0.0");
	});

	it("does not throw on a setting path longer than the box width", () => {
		const longPath = `catalogs.production.@some-long-org/${"x".repeat(60)}`;
		expect(longPath.length).toBeGreaterThan(71);
		expect(() =>
			formatOverrideWarning([
				{ setting: longPath, silkValue: "1.0.0", childValue: "2.0.0", detail: "", kind: "override" },
			]),
		).not.toThrow();
	});
});
