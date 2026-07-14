import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { planEntry } from "../../src/cli/plan.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
	catalog: "silk",
	pkg: "typescript",
	currentRange: "^5.9.0",
	operator: "^",
	rangeSpan: [0, 8],
	...over,
});

const run = (e: CatalogEntry, versions: string[]) => Effect.runPromise(planEntry(e, versions));

describe("planEntry", () => {
	it("offers latest in-range and latest overall, preserving the operator", async () => {
		const c = await run(entry(), ["5.9.0", "5.9.3", "5.9.5-beta.1", "6.0.0", "7.1.0"]);
		expect(c.map((x) => [x.kind, x.range, x.isMajor])).toEqual([
			["in-range", "^5.9.3", false],
			["latest", "^7.1.0", true],
			["keep", "^5.9.0", false],
		]);
	});

	it("returns only keep when already at the newest stable version", async () => {
		const c = await run(entry({ currentRange: "^7.1.0", rangeSpan: [0, 8] }), ["7.1.0"]);
		expect(c.map((x) => x.kind)).toEqual(["keep"]);
	});

	it("does not offer a downgrade when the config is pinned ahead of the registry", async () => {
		const c = await run(entry({ currentRange: "^5.9.5", rangeSpan: [0, 8] }), ["5.9.0", "5.9.3"]);
		expect(c.map((x) => x.kind)).toEqual(["keep"]);
	});

	it("attaches a recomputed peerRange when the entry has a strategy", async () => {
		const c = await run(
			entry({ currentRange: "^4.0.0", strategy: "lock-minor", peer: { value: "^4.0.0", span: [0, 8] } }),
			["4.0.0", "4.2.3"],
		);
		const inRange = c.find((x) => x.kind === "in-range");
		expect(inRange?.range).toBe("^4.2.3");
		expect(inRange?.peerRange).toBe("^4.2.0");
		const keep = c.find((x) => x.kind === "keep");
		expect(keep?.peerRange).toBeUndefined();
	});

	it("does not attach a peerRange to interop candidates (deferred to the group pass)", async () => {
		const entry = {
			catalog: "effect",
			pkg: "effect",
			currentRange: "^3.16.0",
			operator: "^" as const,
			rangeSpan: [0, 8] as [number, number],
			strategy: "interop" as const,
		};
		const candidates = await Effect.runPromise(planEntry(entry, ["3.16.0", "3.17.0"]));
		expect(candidates.every((c) => c.peerRange === undefined)).toBe(true);
	});

	it("offers same-track prerelease candidates when the entry is already on a prerelease", async () => {
		const candidates = await run(entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }), [
			"2.29.0",
			"3.0.0-next.8",
			"3.0.0-next.9",
			"3.0.0-alpha.1",
		]);
		const inRange = candidates.find((c) => c.kind === "in-range");
		expect(inRange?.range).toBe("^3.0.0-next.9");
	});

	it("does not offer an off-track prerelease", async () => {
		// "zzz" sorts above "next" lexically, so the off-track candidate would win
		// the in-range slot if `onTrack` were not filtering it out. This fails
		// pre-fix (no in-range candidate at all) and fails if `onTrack` is removed
		// (in-range becomes ^3.0.0-zzz.1 instead of ^3.0.0-next.9).
		const candidates = await run(entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }), [
			"3.0.0-next.8",
			"3.0.0-next.9",
			"3.0.0-zzz.1",
		]);
		const inRange = candidates.find((c) => c.kind === "in-range");
		expect(inRange?.range).toBe("^3.0.0-next.9");
	});

	it("prefers the stable line once it ships over a same-track prerelease", async () => {
		const withStable = await run(entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }), [
			"3.0.0-next.8",
			"3.0.0-next.9",
			"3.0.0",
		]);
		expect(withStable.find((c) => c.kind === "in-range")?.range).toBe("^3.0.0");

		// Same entry with the stable version removed: the same-track prerelease
		// must win, proving the stable line above outranks it rather than merely
		// being the only survivor.
		const withoutStable = await run(
			entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }),
			["3.0.0-next.8", "3.0.0-next.9"],
		);
		expect(withoutStable.find((c) => c.kind === "in-range")?.range).toBe("^3.0.0-next.9");
	});

	it("marks a same-track prerelease candidate as non-major and a stable cross-major candidate as major", async () => {
		const candidates = await run(entry({ pkg: "@changesets/cli", currentRange: "^3.0.0-next.8", rangeSpan: [0, 15] }), [
			"3.0.0-next.8",
			"3.0.0-next.9",
			"4.0.0",
		]);
		const inRange = candidates.find((c) => c.kind === "in-range");
		expect(inRange?.range).toBe("^3.0.0-next.9");
		expect(inRange?.isMajor).toBe(false);
		const latest = candidates.find((c) => c.kind === "latest");
		expect(latest?.range).toBe("^4.0.0");
		expect(latest?.isMajor).toBe(true);
	});

	it("never offers a prerelease to an entry on a stable range", async () => {
		const candidates = await run(entry({ pkg: "effect", currentRange: "^3.21.4", rangeSpan: [0, 9] }), [
			"3.21.4",
			"3.21.5",
			"3.22.0-next.1",
		]);
		expect(candidates.map((c) => c.range)).not.toContain("^3.22.0-next.1");
		expect(candidates.find((c) => c.kind === "in-range")?.range).toBe("^3.21.5");
	});
});
