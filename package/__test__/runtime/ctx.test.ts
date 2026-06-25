import { describe, expect, it } from "vitest";
import { excludeByRepo, resolveRootName } from "../../src/runtime/ctx.js";

describe("resolveRootName", () => {
	it("prefers rootProjectManifest.name", () => {
		expect(resolveRootName({ rootProjectManifest: { name: "my-repo" } } as never)).toBe("my-repo");
	});
	it("returns undefined when no name resolvable", () => {
		expect(resolveRootName({ rootProjectManifestDir: "/nonexistent-xyz" } as never)).toBeUndefined();
	});
});

describe("excludeByRepo", () => {
	it("removes packages listed for the consuming repo", () => {
		const out = excludeByRepo(
			["@x/cli", "@x/mcp", "lodash"],
			{ rootName: "my-repo" },
			{
				"my-repo": ["@x/cli", "@x/mcp"],
			},
		);
		expect(out).toEqual(["lodash"]);
	});
	it("passes through when the repo has no entry", () => {
		expect(excludeByRepo(["a", "b"], { rootName: "other" }, { "my-repo": ["a"] })).toEqual(["a", "b"]);
	});
});
