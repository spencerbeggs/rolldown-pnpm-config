import { describe, expect, it } from "vitest";
import { EnforcementError } from "../../src/runtime/enforcement.js";
import { createHooks } from "../../src/runtime/index.js";

describe("error enforcement", () => {
	it("throws EnforcementError when an error-enforced field diverges", () => {
		const base = { minimumReleaseAge: 1440 };
		const manifest = { minimumReleaseAge: { strategy: "securityMin", enforcement: "error" as const } };
		expect(() => createHooks(base, manifest, "@acme/cfg").updateConfig({ minimumReleaseAge: 60 })).toThrow(
			EnforcementError,
		);
	});
	it("does NOT throw when an error-enforced field does not diverge", () => {
		const base = { minimumReleaseAge: 1440 };
		const manifest = { minimumReleaseAge: { strategy: "securityMin", enforcement: "error" as const } };
		expect(() => createHooks(base, manifest, "@acme/cfg").updateConfig({ minimumReleaseAge: 2880 })).not.toThrow();
	});
	it("EnforcementError names the field and is identifiable by name", () => {
		try {
			createHooks(
				{ strictDepBuilds: true },
				{ strictDepBuilds: { strategy: "securityFlag", enforcement: "error" as const } },
				"@acme/cfg",
			).updateConfig({ strictDepBuilds: false });
			expect.unreachable("expected createHooks to throw");
		} catch (e) {
			expect((e as Error).name).toBe("EnforcementError");
			expect((e as Error).message).toContain("strictDepBuilds");
		}
	});
});
