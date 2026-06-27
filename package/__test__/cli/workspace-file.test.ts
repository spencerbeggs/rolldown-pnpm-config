import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findWorkspaceFile, parseWorkspace, renderWorkspace } from "../../src/cli/workspace-file.js";

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
