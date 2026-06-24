import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { defineCatalogs } from "../../src/define-catalogs.js";
import { definePlugin } from "../../src/define-plugin.js";
import { freeze } from "../../src/plugin/freeze.js";

describe("freeze", () => {
	it("produces frozen catalogs from a valid config", async () => {
		const config = definePlugin({ catalogs: defineCatalogs([{ name: "silk", packages: { a: "1.0.0" } }]) });
		const frozen = await Effect.runPromise(freeze(config));
		expect(frozen).toEqual({ catalogs: { silk: { a: "1.0.0" } } });
	});

	it("fails with ConfigError when catalogs are malformed", async () => {
		const bad = { catalogs: { catalogs: { silk: { a: 123 } } } } as unknown as Parameters<typeof freeze>[0];
		const exit = await Effect.runPromiseExit(freeze(bad));
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const err = exit.cause;
			expect(String(err)).toContain("ConfigError");
		}
	});
});
