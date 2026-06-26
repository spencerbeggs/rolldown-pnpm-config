// package/__test__/descriptors/derive.test.ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { deriveRegistry, deriveSchemas } from "../../src/descriptors/index.js";
import { Bool } from "../../src/descriptors/schemas.js";
import type { FieldDescriptors } from "../../src/descriptors/types.js";

const FAKE: FieldDescriptors = {
	hoist: { schema: Bool, kind: "boolean", strategy: "scalar", enforcement: "absent", doc: "x" },
	nodeLinker: {
		schema: Schema.Literal("isolated", "hoisted", "pnp"),
		kind: "enum",
		strategy: "scalar",
		enforcement: "absent",
		doc: "y",
		samples: { valid: ["isolated"], invalid: ["nope"] },
	},
};

describe("descriptor derivation", () => {
	it("derives the schema map keyed by field", () => {
		const schemas = deriveSchemas(FAKE);
		expect(Object.keys(schemas).sort()).toEqual(["hoist", "nodeLinker"]);
	});
	it("derives the registry map with strategy + enforcement only", () => {
		expect(deriveRegistry(FAKE)).toEqual({
			hoist: { strategy: "scalar", enforcement: "absent" },
			nodeLinker: { strategy: "scalar", enforcement: "absent" },
		});
	});
});
