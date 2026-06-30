// package/__test__/types/plugin-config.test-d.ts
import type { Schema } from "effect";
import type { FieldInput, PluginConfig } from "../../src/define-plugin.js";
import type { DESCRIPTORS } from "../../src/descriptors/index.js";

type Descriptors = typeof DESCRIPTORS;
type SchemaType<K extends keyof Descriptors> = Schema.Schema.Type<Descriptors[K]["schema"]>;

// Keys checked for key-coverage only (value type intentionally not compared).
type ValueExcluded = "catalogs" | "publicHoistPattern";

// Derived authoring surface for the value-checked keys.
type DerivedPluginConfig = {
	[K in Exclude<keyof Descriptors, ValueExcluded>]?: FieldInput<SchemaType<K>>;
};

type Expect<T extends true> = T;

// Recursively normalize purely cosmetic shape differences between the authored
// config and the Effect-schema-decoded types, WITHOUT touching element/value
// types — so real widening such as `string` vs a `Schema.Literal(...)` union,
// or a structurally different shape, still shows through:
//   - `readonly T[]` -> `T[]`           (Effect `Schema.Array` decodes readonly)
//   - `{ readonly [x: string]: T }`     <-> `Record<string, T>` (strip readonly)
//   - optional-property `| undefined`    (Effect `Schema.optional` adds `| undefined`
//     to the value type; the authored `?:` omits it under
//     exactOptionalPropertyTypes). Stripped via `Exclude<…, undefined>` while the
//     `?` modifier is preserved by the homomorphic mapped type.
type DeepMutable<T> =
	T extends ReadonlyArray<infer U>
		? Array<DeepMutable<U>>
		: T extends object
			? { -readonly [K in keyof T]: Exclude<DeepMutable<T[K]>, undefined> }
			: T;

// Mutual assignability after mutability normalization: true iff A and B are
// assignable to each other. Tolerant of readonly / Record-vs-index-signature
// differences; catches real widening.
type Mutual<A, B> = MutualExact<DeepMutable<A>, DeepMutable<B>>;
type MutualExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// 1) Key coverage: PluginConfig's keys (minus catalogs, the export-only
//    `local` key, and the metadata-only `name` key) exactly equal the
//    value-checked descriptor keys plus publicHoistPattern.
type AuthoredKeys = Exclude<keyof PluginConfig, "catalogs" | "local" | "name">;
type DerivedKeys = keyof DerivedPluginConfig | "publicHoistPattern";
type _AssertKeyCoverage = Expect<Mutual<AuthoredKeys, DerivedKeys>>;

// 2) Value-level: for each value-checked key, authored and derived value types
//    are mutually assignable. A `string` authored against a literal union, or a
//    missing field, yields `false` for that key — which the aggregate below
//    surfaces as a failed assertion.
type ValueDrift = {
	[K in Exclude<keyof Descriptors, ValueExcluded>]: K extends keyof PluginConfig
		? Mutual<NonNullable<PluginConfig[K]>, NonNullable<DerivedPluginConfig[K]>>
		: false;
};
// Aggregate the union of every per-key result. If all keys are `true`, the
// union collapses to `true`. If any key is `false`, the union widens to
// `boolean` (true | false), which does NOT extend `true` and the assertion
// fails. (Mapping failures to `never` — as a naive aggregate would — is unsound:
// `never` is absorbed by unions and `never extends true` is `true`, so such a
// guard can never bite.)
type _AssertNoValueDrift = Expect<ValueDrift[keyof ValueDrift] extends true ? true : false>;

// 3) The export-only `local` key accepts a Partial<PluginConfig> and is optional.
//    This `satisfies` fails to compile if `local` is removed from the type.
const _localAccepted = {
	name: "@test/drift-guard",
	catalogs: {},
	local: { strictDepBuilds: false, publicHoistPattern: ["@override/*"] },
} satisfies PluginConfig;
void _localAccepted;
