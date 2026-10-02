import { describe, expect, it } from "vitest";
import { renderSimulated } from "../../src/cli/simulated-view.js";
import type { Manifest } from "../../src/runtime/types.js";
import { plainText } from "./utils/doc.js";

describe("renderSimulated", () => {
	it("renders the calculated file with merge/overwrite + enforcement annotations", () => {
		const vanilla = {
			strictDepBuilds: true,
			catalogs: { default: { typescript: "^5" } },
			publicHoistPattern: ["@types/*"],
		};
		const manifest: Manifest = {
			strictDepBuilds: { strategy: "scalar", enforcement: "error" },
			catalogs: { strategy: "catalogs", enforcement: "warn" },
			publicHoistPattern: { strategy: "arrayUnion", enforcement: "absent" },
		};
		const text = plainText(renderSimulated(vanilla, manifest));
		expect(text).toContain("strictDepBuilds: true  (overwrite · error)");
		expect(text).toContain("catalogs:  (merge · warn)");
		// absent enforcement → verb only, no enforcement suffix
		expect(text).toContain("publicHoistPattern:  (merge)");
		expect(text).toContain("- @types/*");
		// nested entries are plain, unannotated
		expect(text).toContain("typescript: ^5");
	});

	it("omits the annotation for a field with no manifest entry", () => {
		const text = plainText(renderSimulated({ foo: "bar" }, {}));
		expect(text).toContain("foo: bar");
		expect(text).not.toContain("(");
	});

	it("is not a diff — no +/-/~ gutters", () => {
		const text = plainText(renderSimulated({ a: 1, b: [2] }, {}));
		expect(text).not.toMatch(/^[+\-~] /m);
	});
});
