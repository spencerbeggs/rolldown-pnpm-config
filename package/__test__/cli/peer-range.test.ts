import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { derivePeerRange } from "../../src/cli/peer-range.js";

const run = (range: string, strategy: "lock" | "lock-minor") => Effect.runPromise(derivePeerRange(range, strategy));

describe("derivePeerRange", () => {
	it("lock pins to the exact version, keeping the operator", async () => {
		await expect(run("^6.5.1", "lock")).resolves.toEqual({ range: "^6.5.1", warning: null });
		await expect(run("~6.5.1", "lock")).resolves.toEqual({ range: "~6.5.1", warning: null });
		await expect(run("6.5.1", "lock")).resolves.toEqual({ range: "6.5.1", warning: null });
	});

	it("lock-minor floors the patch to .0, keeping the operator", async () => {
		await expect(run("^6.5.1", "lock-minor")).resolves.toEqual({ range: "^6.5.0", warning: null });
		await expect(run("~4.2.9", "lock-minor")).resolves.toEqual({ range: "~4.2.0", warning: null });
	});

	it("lock preserves prerelease identifiers", async () => {
		await expect(run("^3.0.0-next.8", "lock")).resolves.toEqual({ range: "^3.0.0-next.8", warning: null });
		await expect(run("^1.0.0-beta.2", "lock")).resolves.toEqual({ range: "^1.0.0-beta.2", warning: null });
	});

	it("lock preserves build metadata", async () => {
		await expect(run("^6.5.1+build.7", "lock")).resolves.toEqual({ range: "^6.5.1+build.7", warning: null });
	});

	it("lock-minor floors a stable version and drops build metadata without warning", async () => {
		const result = await run("^6.5.1+build.7", "lock-minor");
		expect(result).toEqual({ range: "^6.5.0", warning: null });
	});

	it("lock-minor degrades to lock on a prerelease and warns", async () => {
		const result = await run("^3.0.0-next.8", "lock-minor");
		expect(result.range).toBe("^3.0.0-next.8");
		expect(result.warning?.kind).toBe("lock-minor-prerelease");
		expect(result.warning?.message).toContain("3.0.0-next.8");
	});

	it("fails on a range it cannot parse", async () => {
		await expect(run(">=5 <6", "lock")).rejects.toThrow();
	});
});
