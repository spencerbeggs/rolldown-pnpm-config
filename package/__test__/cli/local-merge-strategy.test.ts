import { describe, expect, it } from "vitest";
import { applyLocalDirective } from "../../src/cli/local-merge.js";

describe("applyLocalDirective strategy widening", () => {
	it("treats 'merge' as a key-wise union", () => {
		expect(applyLocalDirective({ a: "1" }, { value: { b: "2" }, strategy: "merge" }, {}, "x")).toEqual({
			a: "1",
			b: "2",
		});
	});
	it("passes through on 'rewrite' (handled elsewhere)", () => {
		expect(applyLocalDirective({ a: "1" }, { strategy: "rewrite" }, {}, "x")).toEqual({ a: "1" });
	});
});
