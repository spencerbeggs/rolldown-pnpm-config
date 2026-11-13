import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { freeze } from "../../src/plugin/freeze.js";
import { FIELD_REGISTRY, MANAGED_FIELDS } from "../../src/registry.js";
import { FIELD_SAMPLES } from "./fixtures/field-samples.js";

describe("every managed field freezes to the value pnpm reads", () => {
	it("has a sample for every managed field but catalogs, and none for anything else", () => {
		expect(Object.keys(FIELD_SAMPLES).sort()).toEqual(MANAGED_FIELDS.filter((f) => f !== "catalogs").sort());
	});

	for (const [field, { input, expected }] of Object.entries(FIELD_SAMPLES)) {
		it.effect(`${field}: ships the canonical value with its policy`, () =>
			Effect.gen(function* () {
				const out = yield* freeze({ name: "@test/cfg", catalogs: {}, [field]: input } as never);
				expect(out.base[field]).toEqual(expected);
				const policy = FIELD_REGISTRY[field as keyof typeof FIELD_REGISTRY];
				expect(out.manifest[field]).toEqual({ strategy: policy.strategy, enforcement: policy.enforcement });
			}),
		);
	}
});
