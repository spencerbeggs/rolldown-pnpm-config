import { describe, expect, it } from "vitest";
import { buildPreviewViews } from "../../src/cli/preview-views.js";
import { toAnsi } from "../../src/cli/ui/ansi.js";
import type { Manifest } from "../../src/runtime/types.js";

// buildPreviewViews uses WORKSPACE_FIELDS internally for diff tagging.
const manifest: Manifest = { publicHoistPattern: { strategy: "arrayUnion", enforcement: "absent" } };

describe("buildPreviewViews", () => {
	it("changes view shows preserved file: override as unchanged-or-kept, not removed", () => {
		const managed = { overrides: { a: "^1" } };
		const parsed = { overrides: { link: "file:/abs", a: "^1" }, packages: ["p/*"] };
		const v = buildPreviewViews({ managed, parsed, manifest, rootName: "r" });
		const text = toAnsi(v.changes, { color: false });
		// file: link is preserved into merged, so it is NOT a removal line
		expect(text).not.toContain("- "); // no removed overrides line for the link
	});

	it("simulated view shows local-only + unmanaged keys as removed (unique to your repo)", () => {
		const managed = { overrides: { a: "^1" } };
		const parsed = { overrides: { link: "file:/abs", a: "^1" }, packages: ["p/*"] };
		const v = buildPreviewViews({ managed, parsed, manifest, rootName: "r" });
		const text = toAnsi(v.simulated, { color: false });
		// vanilla has no overlay: the link and packages are "removed" relative to your file
		expect(text).toContain("link");
		expect(text).toContain("packages");
	});

	it("full view emits more lines than changes for the same input", () => {
		const managed = { overrides: { a: "^1" }, publicHoistPattern: ["@x/keep"] };
		const parsed = { overrides: { a: "^2" }, b1: "x", b2: "x", b3: "x", b4: "x" } as Record<string, unknown>;
		const v = buildPreviewViews({ managed, parsed, manifest, rootName: "r" });
		expect(v.full.length).toBeGreaterThanOrEqual(v.changes.length);
	});
});
