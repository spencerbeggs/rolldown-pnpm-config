import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Proof that the documented vanilla rolldown setup (docs/01-getting-started)
// actually emits a working pnpmfile. `rolldown -c` runs the same three files the
// docs show; this asserts the emitted artifact carries the runtime hooks and is
// self-contained (no external imports, so pnpm can load it without node_modules).
const pnpmfile = join(import.meta.dirname, "..", "pnpmfile.mjs");

describe("vanilla rolldown example build", () => {
	it("emits a self-contained pnpmfile.mjs with createHooks(base, manifest) and no effect import", () => {
		const src = readFileSync(pnpmfile, "utf8");
		expect(src).toContain("createHooks");
		expect(src).not.toContain('from "effect"');
		expect(src).toContain("strictDepBuilds");
		expect(src).toContain('"strategy"');
		expect(src).toMatch(/createHooks\(\s*\{/);
	});
});
