import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { derivePeerRange } from "../../src/cli/peer-range.js";

const run = (range: string, strategy: "lock" | "lock-minor") => Effect.runPromise(derivePeerRange(range, strategy));

describe("derivePeerRange", () => {
	it("lock pins to the exact version, keeping the operator", async () => {
		await expect(run("^6.5.1", "lock")).resolves.toBe("^6.5.1");
		await expect(run("~6.5.1", "lock")).resolves.toBe("~6.5.1");
		await expect(run("6.5.1", "lock")).resolves.toBe("6.5.1");
	});

	it("lock-minor floors the patch to .0, keeping the operator", async () => {
		await expect(run("^6.5.1", "lock-minor")).resolves.toBe("^6.5.0");
		await expect(run("~4.2.9", "lock-minor")).resolves.toBe("~4.2.0");
	});

	it("fails on a range it cannot parse", async () => {
		await expect(run(">=5 <6", "lock")).rejects.toThrow();
	});
});
