import { describe, expect, it } from "vitest";
import { combineReleaseAge, filterByReleaseAge, matchesExclude } from "../../src/cli/release-age.js";

const NOW = Date.parse("2026-06-27T00:00:00.000Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("combineReleaseAge", () => {
	it("takes the max age and the union of excludes (strictest age, widest exempt)", () => {
		const out = combineReleaseAge({ ageMinutes: 1440, exclude: ["a"] }, { ageMinutes: 720, exclude: ["b"] });
		expect(out.ageMinutes).toBe(1440);
		expect([...out.exclude].sort()).toEqual(["a", "b"]);
	});

	it("treats null sources as absent and floors age at 0", () => {
		expect(combineReleaseAge(null, null)).toEqual({ ageMinutes: 0, exclude: [] });
		expect(combineReleaseAge({ exclude: ["a"] }, null)).toEqual({ ageMinutes: 0, exclude: ["a"] });
	});
});

describe("matchesExclude", () => {
	it("matches exact names and * globs", () => {
		expect(matchesExclude("@effect/cli", ["@effect/cli"])).toBe(true);
		expect(matchesExclude("@effect/cli", ["@effect/*"])).toBe(true);
		expect(matchesExclude("effect", ["@effect/*"])).toBe(false);
	});
});

describe("filterByReleaseAge", () => {
	const gate = { ageMinutes: 1440, exclude: [] as string[] }; // 1 day
	const times = { "1.0.0": day(10), "1.1.0": day(2), "1.2.0": day(0.5) };

	it("drops versions younger than the cutoff", () => {
		expect(filterByReleaseAge(["1.0.0", "1.1.0", "1.2.0"], times, gate, "p", NOW)).toEqual(["1.0.0", "1.1.0"]);
	});

	it("drops versions with no timestamp", () => {
		expect(filterByReleaseAge(["1.0.0", "9.9.9"], times, gate, "p", NOW)).toEqual(["1.0.0"]);
	});

	it("returns everything when the package is excluded", () => {
		const g = { ageMinutes: 1440, exclude: ["p"] };
		expect(filterByReleaseAge(["1.0.0", "1.2.0", "9.9.9"], times, g, "p", NOW)).toEqual(["1.0.0", "1.2.0", "9.9.9"]);
	});

	it("is a no-op when ageMinutes is 0", () => {
		const g = { ageMinutes: 0, exclude: [] as string[] };
		expect(filterByReleaseAge(["1.0.0", "9.9.9"], {}, g, "p", NOW)).toEqual(["1.0.0", "9.9.9"]);
	});
});
