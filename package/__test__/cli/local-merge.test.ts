import { describe, expect, it } from "vitest";
import { applyLocalDirective, isLocalDirective } from "../../src/cli/local-merge.js";

describe("isLocalDirective", () => {
	it("recognizes directive objects and rejects bare values", () => {
		expect(isLocalDirective({ strategy: "union", value: {} })).toBe(true);
		expect(isLocalDirective({ value: [] })).toBe(true);
		expect(isLocalDirective({ preserve: ["file"] })).toBe(true);
		expect(isLocalDirective(["@x/*"])).toBe(false); // bare array
		expect(isLocalDirective({ lodash: "^4" })).toBe(false); // bare record (foreign key)
		expect(isLocalDirective({ value: ">=1", lodash: "^4" })).toBe(false); // foreign key present
		expect(isLocalDirective(undefined)).toBe(false);
	});
});

describe("applyLocalDirective", () => {
	it("overwrites with a bare value", () => {
		expect(applyLocalDirective({ a: "1" }, { b: "2" }, undefined, "overrides")).toEqual({ b: "2" });
	});

	it("unions record values (value wins on clash)", () => {
		const out = applyLocalDirective(
			{ a: "1", b: "1" },
			{ strategy: "union", value: { b: "2", c: "3" } },
			undefined,
			"overrides",
		);
		expect(out).toEqual({ a: "1", b: "2", c: "3" });
	});

	it("differences record values (removes listed keys)", () => {
		const out = applyLocalDirective(
			{ a: "1", b: "1", c: "1" },
			{ strategy: "difference", value: { b: "x", c: "x" } },
			undefined,
			"overrides",
		);
		expect(out).toEqual({ a: "1" });
	});

	it("unions and differences array values", () => {
		expect(
			applyLocalDirective(["a", "b"], { strategy: "union", value: ["b", "c"] }, undefined, "publicHoistPattern"),
		).toEqual(["a", "b", "c"]);
		expect(
			applyLocalDirective(
				["@x/cli", "@x/mcp", "@y/z"],
				{ strategy: "difference", value: ["@x/cli", "@x/mcp"] },
				undefined,
				"publicHoistPattern",
			),
		).toEqual(["@y/z"]);
	});

	it("preserves file:/link:/workspace:/portal: overrides from the parsed file by default", () => {
		const managed = { "@isaacs/brace-expansion": "^5.0.1" };
		const parsed = { "rolldown-pnpm-config": "file:/abs/pkg", lodash: "^4.0.0" };
		const out = applyLocalDirective(managed, undefined, parsed, "overrides") as Record<string, string>;
		expect(out["@isaacs/brace-expansion"]).toBe("^5.0.1"); // managed kept
		expect(out["rolldown-pnpm-config"]).toBe("file:/abs/pkg"); // file: preserved
		expect("lodash" in out).toBe(false); // non-protocol entry NOT preserved
	});

	it("an explicit preserve list replaces the default", () => {
		const parsed = { gitdep: "git+ssh://x", filedep: "file:/x" };
		const out = applyLocalDirective({}, { preserve: ["git+ssh"] }, parsed, "overrides") as Record<string, string>;
		expect(out.gitdep).toBe("git+ssh://x"); // explicitly preserved
		expect("filedep" in out).toBe(false); // file: no longer in the list
	});

	it("does not preserve for non-overrides fields", () => {
		const out = applyLocalDirective(["a"], undefined, ["file:x"], "publicHoistPattern");
		expect(out).toEqual(["a"]);
	});
});
