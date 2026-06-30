import { describe, expect, it } from "vitest";
import { formatOverrideWarning, formatSecurityWarning } from "../../src/runtime/warnings.js";

describe("runtime is de-silked", () => {
	it("warning output contains no 'silk'", () => {
		const overrideFixture = [
			{
				setting: "s",
				managedValue: "1",
				localValue: "2",
				detail: "Local version overrides the managed version.",
				kind: "override" as const,
			},
		];
		const securityFixture = [
			{
				setting: "s",
				managedValue: "1",
				localValue: "2",
				detail: "Local version overrides the managed version.",
				kind: "security" as const,
			},
		];
		expect(formatOverrideWarning(overrideFixture, "@acme/cfg").toLowerCase()).not.toContain("silk");
		expect(formatSecurityWarning(securityFixture, "@acme/cfg").toLowerCase()).not.toContain("silk");
	});
});
