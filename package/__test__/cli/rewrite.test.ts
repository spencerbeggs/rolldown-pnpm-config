import { describe, expect, it } from "vitest";
import { applyEdits } from "../../src/cli/rewrite.js";

describe("applyEdits", () => {
	it("replaces multiple spans, applying right-to-left", () => {
		const src = `a "^5.9.0" b "^4.0.0" c`;
		const out = applyEdits(src, [
			{ span: [2, 10], text: '"^7.1.0"' },
			{ span: [13, 21], text: '"^4.2.0"' },
		]);
		expect(out).toBe(`a "^7.1.0" b "^4.2.0" c`);
	});

	it("is a no-op for an empty edit list", () => {
		expect(applyEdits("x", [])).toBe("x");
	});

	it("throws on overlapping spans", () => {
		expect(() =>
			applyEdits("abcdef", [
				{ span: [0, 3], text: "X" },
				{ span: [2, 5], text: "Y" },
			]),
		).toThrow(RangeError);
	});
});
