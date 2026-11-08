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
});
