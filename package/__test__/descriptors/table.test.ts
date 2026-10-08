// package/__test__/descriptors/table.test.ts

import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { DESCRIPTORS } from "../../src/descriptors/index.js";
import type { FieldDescriptor } from "../../src/descriptors/types.js";
import { STRATEGY_TABLE } from "../../src/runtime/strategies/table.js";
import { samplesFor } from "./samples.js";

describe("descriptor table integrity", () => {
	for (const [field, desc] of Object.entries(DESCRIPTORS) as [string, FieldDescriptor<any>][]) {
		describe(field, () => {
			it("names a strategy that exists", () => {
				expect(STRATEGY_TABLE[desc.strategy], `unknown strategy "${desc.strategy}"`).toBeDefined();
			});
			it.effect("accepts valid samples", () =>
				Effect.gen(function* () {
					for (const v of samplesFor(desc).valid) {
						expect(yield* Schema.decodeUnknownEffect(desc.schema)(v)).toBeDefined();
					}
				}),
			);
			it.effect("rejects invalid samples", () =>
				Effect.gen(function* () {
					for (const v of samplesFor(desc).invalid) {
						expect((yield* Effect.exit(Schema.decodeUnknownEffect(desc.schema)(v)))._tag).toBe("Failure");
					}
				}),
			);
			it("declares workspaceYaml as a boolean", () => {
				expect(typeof desc.workspaceYaml).toBe("boolean");
			});
		});
	}

	it("classifies known fields correctly", () => {
		expect(DESCRIPTORS.confirmModulesPurge.workspaceYaml).toBe(false);
		expect(DESCRIPTORS.catalogs.workspaceYaml).toBe(true);
		expect(DESCRIPTORS.publicHoistPattern.workspaceYaml).toBe(true);
		expect(DESCRIPTORS.overrides.workspaceYaml).toBe(true);
	});
});
