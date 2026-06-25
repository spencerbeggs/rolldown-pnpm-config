import { describe, expect, it } from "vitest";
import { arrayRecordUnion, arrayUnion } from "../../../src/runtime/strategies/arrays.js";
import { mapChildWins } from "../../../src/runtime/strategies/maps.js";

const ctx = { rootName: undefined };

describe("mapChildWins", () => {
	it("overlays child entries on silk, no divergences", () => {
		const r = mapChildWins({ a: 1, b: 2 }, { b: 9, c: 3 }, ctx);
		expect(r.merged).toEqual({ a: 1, b: 9, c: 3 });
		expect(r.divergences).toEqual([]);
	});
});

describe("arrayUnion", () => {
	it("unions + sorts, no divergences", () => {
		const r = arrayUnion(["b", "a"], ["a", "c"], ctx);
		expect(r.merged).toEqual(["a", "b", "c"]);
		expect(r.divergences).toEqual([]);
	});
});

describe("arrayRecordUnion", () => {
	it("unions per axis, drops empty, no divergences", () => {
		const r = arrayRecordUnion({ os: ["linux"] }, { os: ["darwin"], cpu: [] }, ctx);
		expect(r.merged).toEqual({ os: ["darwin", "linux"] });
		expect(r.divergences).toEqual([]);
	});
});
