import { describe, expect, it } from "vitest";
import { detectCapabilities } from "../../src/cli/ui/env.js";

describe("detectCapabilities", () => {
	it("returns a capability record of booleans", () => {
		const caps = detectCapabilities();
		expect(typeof caps.color).toBe("boolean");
		expect(typeof caps.interactive).toBe("boolean");
		expect(typeof caps.hyperlinks).toBe("boolean");
	});
});
