// package/src/descriptors/types.ts
import type { Schema } from "effect";
import type { Enforcement } from "../runtime/types.js";

/** Type tag used for doc rendering and default test-sample synthesis. @internal */
export type FieldKind =
	| "boolean"
	| "number"
	| "string"
	| "enum"
	| "union"
	| "stringArray"
	| "stringRecord"
	| "booleanRecord"
	| "unknownRecord"
	| "stringArrayRecord"
	| "object";

/** Optional per-field runtime refine data (plain data, never code). @internal */
export interface FieldOptions {
	readonly excludeByRepo?: boolean;
}

/** One managed pnpm field. The single source of truth for schema + merge policy. @internal */
export interface FieldDescriptor<A = unknown> {
	// biome-ignore lint/suspicious/noExplicitAny: heterogeneous per-field encoded types; `unknown` breaks Schema invariance.
	readonly schema: Schema.Schema<A, any>;
	readonly kind: FieldKind;
	readonly strategy: string;
	readonly enforcement: Enforcement;
	readonly doc: string;
	/** Whether this field is valid in pnpm-workspace.yaml (and thus exportable). */
	readonly workspaceYaml: boolean;
	readonly anchor?: string;
	readonly options?: FieldOptions;
	/** Required for kind "enum"/"union"/"object"; synthesized otherwise. */
	readonly samples?: { readonly valid: readonly unknown[]; readonly invalid: readonly unknown[] };
}

/** Wide map type for the derivation helpers. `any` (not `unknown`) sidesteps
 *  Schema's invariance so narrow per-field entries stay assignable. @internal */
// biome-ignore lint/suspicious/noExplicitAny: see above — `any` keeps narrow per-field descriptors assignable.
export type FieldDescriptors = Record<string, FieldDescriptor<any>>;
