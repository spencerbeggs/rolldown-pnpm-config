import { describe, expect, it } from "vitest";
import { arrayRecordUnion, arrayUnion, sectionMerge } from "../../../src/runtime/strategies/arrays.js";
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

describe("array strategies order is locale-independent", () => {
	it("sorts union elements and record axes by code unit", () => {
		expect(arrayUnion(["b", "B"], ["a"], ctx).merged).toEqual(["B", "a", "b"]);
		expect(Object.keys(arrayRecordUnion({ b: ["x"], B: ["x"] }, { a: ["x"] }, ctx).merged as object)).toEqual([
			"B",
			"a",
			"b",
		]);
	});
});

describe("sectionMerge", () => {
	it("unions a list key with the managed one, deduped and sorted, so no managed entry is lost", () => {
		const r = sectionMerge({ ignore: ["GHSA-b", "GHSA-a"], level: "high" }, { ignore: ["GHSA-c", "GHSA-a"] }, ctx);
		expect(r.merged).toEqual({ ignore: ["GHSA-a", "GHSA-b", "GHSA-c"], level: "high" });
		expect(r.divergences).toEqual([]);
	});

	it("lets the consumer's scalar keys win", () => {
		const r = sectionMerge({ level: "high", ignorePrune: true }, { level: "low", ignorePrune: false }, ctx);
		expect(r.merged).toEqual({ ignorePrune: false, level: "low" });
	});

	it("keeps a list only one side declares, and the managed section when the consumer has none", () => {
		expect(sectionMerge({ ignoreDeps: ["typescript"] }, { changeset: true }, ctx).merged).toEqual({
			changeset: true,
			ignoreDeps: ["typescript"],
		});
		expect(sectionMerge({ level: "moderate" }, undefined, ctx).merged).toEqual({ level: "moderate" });
	});
});
