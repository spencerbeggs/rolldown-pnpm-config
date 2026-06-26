// package/src/descriptors/index.ts
import type { Schema } from "effect";
import type { Enforcement } from "../runtime/types.js";
import { build } from "./build.js";
import { hoisting } from "./hoisting.js";
import { lockfile } from "./lockfile.js";
import { misc } from "./misc.js";
import { network } from "./network.js";
import { resolution } from "./resolution.js";
import { runtimeCfg } from "./runtime-cfg.js";
import type { FieldDescriptors } from "./types.js";
import { workspace } from "./workspace.js";

// Category modules merged into the single source of truth.
// `satisfies` (never a `: FieldDescriptors` annotation) keeps each entry's
// narrow schema type so the drift assertion can read per-field value types.
export const DESCRIPTORS = {
	...resolution,
	...hoisting,
	...lockfile,
	...build,
	...runtimeCfg,
	...workspace,
	...misc,
	...network,
} satisfies FieldDescriptors;

/** Derive the per-field validation schemas consumed by freeze(). @internal */
export function deriveSchemas(d: FieldDescriptors): Record<string, Schema.Schema<unknown, unknown>> {
	const out: Record<string, Schema.Schema<unknown, unknown>> = {};
	for (const [field, desc] of Object.entries(d)) out[field] = desc.schema;
	return out;
}

/** Derive the strategy + enforcement registry consumed by freeze(). @internal */
export function deriveRegistry(
	d: FieldDescriptors,
): Record<string, { readonly strategy: string; readonly enforcement: Enforcement }> {
	const out: Record<string, { readonly strategy: string; readonly enforcement: Enforcement }> = {};
	for (const [field, desc] of Object.entries(d))
		out[field] = { strategy: desc.strategy, enforcement: desc.enforcement };
	return out;
}
