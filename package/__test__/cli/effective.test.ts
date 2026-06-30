import { describe, expect, it } from "vitest";
import { effectiveManaged, vanillaManaged } from "../../src/cli/effective.js";
import type { Manifest } from "../../src/runtime/types.js";

const manifestWith = (byRepo?: Record<string, string[]>): Manifest => ({
	publicHoistPattern: {
		strategy: "arrayUnion",
		enforcement: "absent",
		...(byRepo ? { options: { excludeByRepo: byRepo } } : {}),
	},
});

describe("effectiveManaged", () => {
	it("drops repo-assigned packages from publicHoistPattern", () => {
		const managed = { publicHoistPattern: ["@x/cli", "@x/keep"] };
		const out = effectiveManaged(managed, undefined, {}, manifestWith({ "my-repo": ["@x/cli"] }), "my-repo");
		expect(out.publicHoistPattern).toEqual(["@x/keep"]);
	});

	it("no-ops excludeByRepo when the repo is unresolved", () => {
		const managed = { publicHoistPattern: ["@x/cli"] };
		const out = effectiveManaged(managed, undefined, {}, manifestWith({ "my-repo": ["@x/cli"] }), undefined);
		expect(out.publicHoistPattern).toEqual(["@x/cli"]);
	});

	it("applies excludeByRepo BEFORE a local difference", () => {
		const managed = { publicHoistPattern: ["@x/cli", "@x/a", "@x/b"] };
		const local = { publicHoistPattern: { strategy: "difference", value: ["@x/a"] } };
		const out = effectiveManaged(managed, local, {}, manifestWith({ "my-repo": ["@x/cli"] }), "my-repo");
		expect(out.publicHoistPattern).toEqual(["@x/b"]); // @x/cli by repo, @x/a by local
	});

	it("preserves file: overrides by default with no local config", () => {
		const managed = { overrides: { "@isaacs/x": "^5" } };
		const parsed = { overrides: { link: "file:/abs" } };
		const out = effectiveManaged(managed, undefined, parsed, {}, "my-repo") as { overrides: Record<string, string> };
		expect(out.overrides).toEqual({ "@isaacs/x": "^5", link: "file:/abs" });
	});
});

describe("vanillaManaged", () => {
	it("applies excludeByRepo but no local/preserve", () => {
		const managed = { publicHoistPattern: ["@x/cli", "@x/keep"], overrides: { a: "^1" } };
		const _parsed = { overrides: { link: "file:/abs" } };
		const out = vanillaManaged(managed, manifestWith({ "my-repo": ["@x/cli"] }), "my-repo") as Record<string, unknown>;
		expect(out.publicHoistPattern).toEqual(["@x/keep"]);
		expect(out.overrides).toEqual({ a: "^1" }); // NOT preserving parsed file: link
	});
});
