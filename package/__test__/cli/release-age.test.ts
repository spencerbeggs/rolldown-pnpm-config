import { describe, expect, it } from "vitest";
import { parsePnpmGate, readConfigReleaseAge } from "../../src/cli/release-age.js";

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

describe("parsePnpmGate", () => {
	it("parses integer age and a JSON-array or whitespace exclude list", () => {
		expect(parsePnpmGate("1440", '["@effect/cli","effect"]')).toEqual({
			ageMinutes: 1440,
			exclude: ["@effect/cli", "effect"],
		});
		expect(parsePnpmGate("720", "a b  c")).toEqual({ ageMinutes: 720, exclude: ["a", "b", "c"] });
	});

	it("returns null when unset and ignores non-numeric age", () => {
		expect(parsePnpmGate(null, null)).toBeNull();
		expect(parsePnpmGate("undefined", "")).toBeNull();
	});
});
