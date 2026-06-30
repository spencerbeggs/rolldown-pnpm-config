import { describe, expect, it } from "vitest";
import { reconcilePatches } from "../../src/patches/reconcile.js";

describe("reconcilePatches", () => {
	it("flags entries whose patch file is missing on disk", () => {
		const report = reconcilePatches({
			parsedPatched: { "a@1": "patches/a@1.patch", "b@2": "patches/b@2.patch" },
			root: "/repo",
			exists: (p) => p === "/repo/patches/a@1.patch",
		});
		expect(report.staleEntries).toEqual(["b@2"]);
	});
	it("flags a key that does not match its filename", () => {
		const report = reconcilePatches({
			parsedPatched: { "react@18": "patches/wrong.patch" },
			root: "/repo",
			exists: () => true,
		});
		expect(report.keyMismatches).toEqual(["react@18"]);
	});
	it("is silent for a consistent, present entry", () => {
		const report = reconcilePatches({
			parsedPatched: { "is-odd@3.0.1": "patches/is-odd@3.0.1.patch" },
			root: "/repo",
			exists: () => true,
		});
		expect(report).toEqual({ staleEntries: [], keyMismatches: [] });
	});
});
