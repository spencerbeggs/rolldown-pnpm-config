import { describe, expect, it } from "vitest";
import { readConfigReleaseAge } from "../../src/cli/release-age.js";

describe("readConfigReleaseAge", () => {
	it("reads number + array fields, including the { value } wrapper form", () => {
		expect(readConfigReleaseAge({ minimumReleaseAge: 1440, minimumReleaseAgeExclude: ["@effect/*"] })).toEqual({
			ageMinutes: 1440,
			exclude: ["@effect/*"],
		});
		// FieldInput<T> wrapper: { value, enforcement }
		expect(readConfigReleaseAge({ minimumReleaseAge: { value: 720 } })).toEqual({ ageMinutes: 720 });
	});

	it("returns null when neither field is present", () => {
		expect(readConfigReleaseAge({ other: 1 })).toBeNull();
		expect(readConfigReleaseAge(null)).toBeNull();
	});

	it("reads a string age as the number freeze ships, so the gate never fails open", () => {
		expect(readConfigReleaseAge({ minimumReleaseAge: "1440" })).toEqual({ ageMinutes: 1440 });
		expect(readConfigReleaseAge({ minimumReleaseAge: { value: "720", enforcement: "warn" } })).toEqual({
			ageMinutes: 720,
		});
	});

	it("contributes nothing for a value freeze refuses", () => {
		expect(readConfigReleaseAge({ minimumReleaseAge: "soon" })).toBeNull();
		expect(readConfigReleaseAge({ minimumReleaseAge: -5 })).toBeNull();
	});
});
