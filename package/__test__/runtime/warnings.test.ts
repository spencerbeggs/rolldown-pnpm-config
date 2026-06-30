import { describe, expect, it } from "vitest";
import { formatOverrideWarning, formatSecurityWarning } from "../../src/runtime/warnings.js";

const ov = [
	{ setting: "catalogs.x.foo", managedValue: "^1.0.0", localValue: "^2.0.0", detail: "", kind: "override" as const },
];
const sec = [
	{
		setting: "strictDepBuilds",
		managedValue: "true",
		localValue: "false",
		detail: "Disables a security check the managed config enabled.",
		kind: "security" as const,
	},
];

describe("formatOverrideWarning", () => {
	it("returns empty string for no divergences", () => {
		expect(formatOverrideWarning([], "@acme/cfg")).toBe("");
	});

	it("renders a box containing the setting and both versions", () => {
		const box = formatOverrideWarning(
			[{ setting: "catalogs.default.a", managedValue: "1.0.0", localValue: "2.0.0", detail: "", kind: "override" }],
			"@acme/cfg",
		);
		expect(box).toContain("CATALOG OVERRIDE DETECTED");
		expect(box).toContain("catalogs.default.a");
		expect(box).toContain("1.0.0");
		expect(box).toContain("2.0.0");
	});

	it("does not throw on a setting path longer than the box width", () => {
		const longPath = `catalogs.production.@some-long-org/${"x".repeat(60)}`;
		expect(longPath.length).toBeGreaterThan(71);
		expect(() =>
			formatOverrideWarning(
				[{ setting: longPath, managedValue: "1.0.0", localValue: "2.0.0", detail: "", kind: "override" }],
				"@acme/cfg",
			),
		).not.toThrow();
	});

	it("override box carries the [name] tag and no 'silk'", () => {
		const out = formatOverrideWarning(ov, "@acme/cfg");
		expect(out).toContain("[@acme/cfg]");
		expect(out).toContain("Managed version:");
		expect(out.toLowerCase()).not.toContain("silk");
	});
});

describe("formatSecurityWarning", () => {
	it("returns empty string for no divergences", () => {
		expect(formatSecurityWarning([], "@acme/cfg")).toBe("");
	});

	it("security box carries the [name] tag and managed=/local= wording", () => {
		const out = formatSecurityWarning(sec, "@acme/cfg");
		expect(out).toContain("[@acme/cfg]");
		expect(out).toContain("managed=true -> local=false");
		expect(out.toLowerCase()).not.toContain("silk");
	});
});
