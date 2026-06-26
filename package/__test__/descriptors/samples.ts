// package/__test__/descriptors/samples.ts
import type { FieldDescriptor } from "../../src/descriptors/types.js";

const BY_KIND: Record<string, { valid: unknown[]; invalid: unknown[] }> = {
	boolean: { valid: [true, false], invalid: ["x", 1] },
	number: { valid: [0, 42], invalid: ["x", true] },
	string: { valid: ["x", "./p"], invalid: [5, true] },
	stringArray: { valid: [[], ["a", "b"]], invalid: ["a", [1]] },
	stringRecord: { valid: [{}, { a: "1" }], invalid: [[], { a: 1 }] },
	booleanRecord: { valid: [{}, { a: true }], invalid: [[], { a: "x" }] },
	unknownRecord: { valid: [{}, { a: 1 }, { a: "x" }], invalid: ["x", []] },
	stringArrayRecord: { valid: [{}, { os: ["linux"] }], invalid: [{ os: "linux" }] },
};

export function samplesFor(desc: FieldDescriptor<any>): { valid: readonly unknown[]; invalid: readonly unknown[] } {
	if (desc.samples) return desc.samples;
	const synth = BY_KIND[desc.kind];
	if (!synth) throw new Error(`Descriptor kind "${desc.kind}" requires explicit samples`);
	return synth;
}
