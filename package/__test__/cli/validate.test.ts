import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { PlannedEdit } from "../../src/cli/types.js";
import { rangeIsSatisfiable, validateEdits } from "../../src/cli/validate.js";

const sat = (range: string, versions: readonly string[]) => Effect.runPromise(rangeIsSatisfiable(range, versions));

describe("rangeIsSatisfiable", () => {
	it("accepts a floor that no published version equals but some version satisfies", async () => {
		await expect(sat("^3.4.0", ["3.4.1", "3.5.0"])).resolves.toBe(true);
	});

	it("rejects a stable range when only prereleases of that version exist", async () => {
		await expect(sat("^3.0.0", ["2.29.0", "3.0.0-next.8"])).resolves.toBe(false);
	});

	it("accepts a prerelease range matched by its own version", async () => {
		await expect(sat("^3.0.0-next.8", ["3.0.0-next.8"])).resolves.toBe(true);
	});

	it("accepts an exact range that was published", async () => {
		await expect(sat("6.5.1", ["6.5.0", "6.5.1"])).resolves.toBe(true);
	});

	it("rejects a range no version satisfies", async () => {
		await expect(sat("^9.0.0", ["1.0.0", "2.0.0"])).resolves.toBe(false);
	});

	it("accepts anything when the version list is empty (cannot validate offline)", async () => {
		await expect(sat("^9.0.0", [])).resolves.toBe(true);
	});

	it("accepts a range it cannot parse rather than rejecting it", async () => {
		await expect(sat(">=5 <6", ["5.1.0"])).resolves.toBe(true);
	});
});

describe("validateEdits", () => {
	const edit = (pkg: string, kind: "range" | "peer", value: string): PlannedEdit => ({
		span: [0, 1],
		text: JSON.stringify(value),
		pkg,
		kind,
		value,
	});

	it("splits satisfiable from unsatisfiable edits when they belong to different packages", async () => {
		const edits = [edit("a", "range", "^1.2.0"), edit("b", "peer", "^9.0.0")];
		const versions = new Map([
			["a", ["1.2.3"]],
			["b", ["1.0.0"]],
		]);
		const result = await Effect.runPromise(validateEdits(edits, versions));
		expect(result.accepted).toHaveLength(1);
		expect(result.accepted[0].value).toBe("^1.2.0");
		expect(result.rejected).toHaveLength(1);
		expect(result.rejected[0]).toMatchObject({ pkg: "b", kind: "peer", value: "^9.0.0" });
	});

	it("accepts every edit for a package with no fetched versions", async () => {
		const edits = [edit("a", "peer", "^9.0.0")];
		const result = await Effect.runPromise(validateEdits(edits, new Map()));
		expect(result.rejected).toEqual([]);
		expect(result.accepted).toHaveLength(1);
	});

	it("rejects a package's satisfiable edit ATOMICALLY when its paired edit is unsatisfiable", async () => {
		// The reproduction case: an exact-pinned lock-minor package where the range
		// bump is satisfiable but the derived peer floor was never published. Both
		// edits share pkg "a", so both must drop — never a half-written package.
		const edits = [edit("a", "range", "3.4.2"), edit("a", "peer", "3.4.0")];
		const versions = new Map([["a", ["3.4.1", "3.4.2"]]]);
		const result = await Effect.runPromise(validateEdits(edits, versions));
		expect(result.accepted).toEqual([]);
		expect(result.rejected).toHaveLength(2);
		const byKind = new Map(result.rejected.map((r) => [r.kind, r]));
		expect(byKind.get("peer")).toMatchObject({ pkg: "a", value: "3.4.0" });
		expect(byKind.get("peer")?.reason).toContain("no published version of a satisfies 3.4.0");
		expect(byKind.get("range")).toMatchObject({ pkg: "a", value: "3.4.2" });
		expect(byKind.get("range")?.reason).toContain("dropped along with its peer edit for a");
	});

	it("does not let one bad package's rejection touch an unrelated good package", async () => {
		const edits = [edit("good", "range", "1.2.0"), edit("bad", "range", "9.9.9"), edit("bad", "peer", "9.9.0")];
		const versions = new Map([
			["good", ["1.2.0"]],
			["bad", ["1.0.0"]],
		]);
		const result = await Effect.runPromise(validateEdits(edits, versions));
		expect(result.accepted).toHaveLength(1);
		expect(result.accepted[0]).toMatchObject({ pkg: "good", value: "1.2.0" });
		expect(result.rejected).toHaveLength(2);
		expect(result.rejected.every((r) => r.pkg === "bad")).toBe(true);
	});
});
