// package/__test__/descriptors/table.test.ts
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
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
			it("accepts valid samples", async () => {
				for (const v of samplesFor(desc).valid) {
					await expect(Effect.runPromise(Schema.decodeUnknown(desc.schema)(v))).resolves.toBeDefined();
				}
			});
			it("rejects invalid samples", async () => {
				for (const v of samplesFor(desc).invalid) {
					await expect(Effect.runPromise(Schema.decodeUnknown(desc.schema)(v))).rejects.toBeTruthy();
				}
			});
		});
	}
});
