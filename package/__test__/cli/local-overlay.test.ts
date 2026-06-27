import { describe, expect, it } from "vitest";
import { applyLocal } from "../../src/cli/local-overlay.js";

describe("applyLocal", () => {
	it("overlays local fields and strips the local key", () => {
		const out = applyLocal({
			catalogs: { silk: { packages: {} } },
			publicHoistPattern: ["@types/*"],
			local: { publicHoistPattern: ["@override/*"] },
		});
		expect(out).toEqual({ catalogs: { silk: { packages: {} } }, publicHoistPattern: ["@override/*"] });
		expect("local" in out).toBe(false);
	});

	it("is a no-op when there is no local key", () => {
		expect(applyLocal({ publicHoistPattern: ["@types/*"] })).toEqual({ publicHoistPattern: ["@types/*"] });
	});
});
