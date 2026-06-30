import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalize, findWorkspaceFile, parseWorkspace, renderWorkspace } from "../../src/cli/workspace-file.js";

describe("workspace-file", () => {
	it("walks up to find pnpm-workspace.yaml", () => {
		const root = mkdtempSync(join(tmpdir(), "rpc-ws-"));
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - pkg/*\n", "utf8");
		const sub = join(root, "a", "b");
		mkdirSync(sub, { recursive: true });
		expect(findWorkspaceFile(sub)).toBe(join(root, "pnpm-workspace.yaml"));
		expect(findWorkspaceFile(mkdtempSync(join(tmpdir(), "rpc-none-")))).toBeNull();
	});

	it("parses and renders deterministically and idempotently", () => {
		const parsed = parseWorkspace('publicHoistPattern:\n  - "@types/*"\npackages:\n  - pkg/*\n');
		expect(parsed).toEqual({ publicHoistPattern: ["@types/*"], packages: ["pkg/*"] });
		const once = renderWorkspace(parsed);
		expect(renderWorkspace(parseWorkspace(once))).toBe(once); // idempotent
		expect(parseWorkspace("")).toEqual({});
	});
});

describe("canonicalize", () => {
	it("sorts primitive arrays lexicographically", () => {
		expect(canonicalize({ a: ["swc", "esbuild", "sharp"] })).toEqual({ a: ["esbuild", "sharp", "swc"] });
	});

	it("preserves arrays that contain objects", () => {
		const v = { a: [{ x: 2 }, { x: 1 }] };
		expect(canonicalize(v)).toEqual({ a: [{ x: 2 }, { x: 1 }] });
	});

	it("alpha-sorts object keys recursively", () => {
		expect(Object.keys(canonicalize({ b: 1, a: { d: 1, c: 2 } }) as Record<string, unknown>)).toEqual(["a", "b"]);
	});
});
