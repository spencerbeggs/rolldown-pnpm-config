# Full pnpm-workspace.yaml Settings Coverage Implementation Plan

> **Status: COMPLETED 2026-06-26** (branch `feat/complete-schema`). All tasks (1–15) landed: the descriptor table is the single source of truth, `FIELD_SCHEMAS`/`FIELD_REGISTRY` derive from `DESCRIPTORS`, the managed surface is 121 fields, the value-level drift guard is in place and the 14 parity-locked fields stay byte-identical to Silk. The resulting architecture is documented in [`../architecture.md`](../architecture.md) and the field-by-field matrix in [`../settings-coverage.md`](../settings-coverage.md); the design rationale is in [`../specs/2026-06-26-pnpm-settings-coverage-design.md`](../specs/2026-06-26-pnpm-settings-coverage-design.md). Retained as a historical implementation record; the checkbox steps below are no longer live tracking.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the managed pnpm-workspace.yaml field surface from 14 to ~120 workspace-appropriate fields, driven by a single declarative descriptor table, without changing the runtime merge engine.

**Architecture:** One descriptor table (`package/src/descriptors/`) is the single source of truth; `FIELD_SCHEMAS` and `FIELD_REGISTRY` are derived from it. The `{ base, manifest }` contract, runtime engine (`createHooks`), strategy table, enforcement, and serialization are untouched — this is purely a front-of-pipeline change. A table-driven test suite validates every field; a compile-time assertion keeps the hand-authored `PluginConfig` type in lockstep with the table.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), Effect `Schema` (build-time validation only), Vitest (`forks` pool), Biome, markdownlint, Turbo.

## Global Constraints

- **Effect runs at build time only.** Descriptor schemas use `effect`'s `Schema`; the runtime bundle stays zero-dependency. Do not import `effect` from anything under `package/src/runtime/`.
- **Imports:** relative imports use `.js` extensions; Node built-ins use `node:`; type-only imports use `import type`.
- **The 14 existing fields are parity-locked.** Their strategy + enforcement must remain exactly as in `package/src/registry.ts` (see Task 2 table). The parity suite in `package/__test__/parity/` must stay green — it is the proof of no behavior change.
- **Enforcement defaults for new fields:** security/supply-chain fields → `"warn"`; all others → `"absent"`.
- **No new merge strategies** are expected; reuse the existing entries in `STRATEGY_TABLE` (`scalar`, `arrayUnion`, `arrayRecordUnion`, `mapChildWins`, `overrides`, `peerDependencyRules`, `catalogs`, `allowBuilds`, `securityFlag`, `securityMin`).
- **`doc` field content:** the one-line description copied from the field's pnpm.io anchor (`https://pnpm.io/settings#<anchor>`). `confirmModulesPurge` has no upstream doc — use `"Whether pnpm prompts before purging node_modules (undocumented upstream)."`.
- **Tests live in `package/__test__/`**, never co-located in `src/`. Unit tests `*.test.ts`; integration `parity/*.int.test.ts`; type tests `*.test-d.ts`.
- **Commits:** conventional format + DCO signoff `Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>`.
- **Spec:** `.claude/design/rolldown-pnpm-config/specs/2026-06-26-pnpm-settings-coverage-design.md` (coverage matrix is authoritative for key → strategy → enforcement).

## File Structure

```text
package/src/descriptors/
├── types.ts          # FieldDescriptor, FieldKind, StrategyName, FieldOptions
├── schemas.ts        # shared Schema constants (Bool, Num, Str, StringArray, ...)
├── index.ts          # DESCRIPTORS (merge of all category modules) + deriveSchemas/deriveRegistry
├── resolution.ts     # dependency resolution + trust + catalog fields
├── hoisting.ts       # hoisting + node-modules + store fields
├── lockfile.ts       # lockfile + peers fields
├── build.ts          # build/scripts + patches + injection fields
├── runtime-cfg.ts    # pm-version + node-version fields
├── workspace.ts      # workspace + audit + misc preference fields
└── network.ts        # network tuning + publish fields
package/src/registry.ts      # MODIFY: re-export derived FIELD_REGISTRY
package/src/plugin/freeze.ts # MODIFY: import derived FIELD_SCHEMAS/FIELD_REGISTRY
package/src/define-plugin.ts # MODIFY: grow hand-authored PluginConfig
package/__test__/descriptors/table.test.ts        # table-driven field suite
package/__test__/types/plugin-config.test-d.ts    # drift assertion (type-level)
docs/pnpm-settings-coverage.md                     # user-facing GitHub doc
.claude/design/rolldown-pnpm-config/settings-coverage.md  # design-doc matrix mirror
```

---

### Task 1: Descriptor types, shared schemas, and derivation helpers

**Files:**

- Create: `package/src/descriptors/types.ts`
- Create: `package/src/descriptors/schemas.ts`
- Create: `package/src/descriptors/index.ts`
- Test: `package/__test__/descriptors/derive.test.ts`

**Interfaces:**

- Produces: `FieldDescriptor`, `FieldKind`, `FieldDescriptors` (a `Record<string, FieldDescriptor>`); `deriveSchemas(d): Record<string, Schema.Schema<unknown, unknown>>`; `deriveRegistry(d): Record<string, { strategy: string; enforcement: Enforcement }>`; shared schema constants `Bool, Num, Str, StringArray, StringRecord, BooleanRecord, UnknownRecord, StringArrayRecord`.

- [ ] **Step 1: Write the failing test**

```ts
// package/__test__/descriptors/derive.test.ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Bool } from "../../src/descriptors/schemas.js";
import { deriveRegistry, deriveSchemas } from "../../src/descriptors/index.js";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run package/__test__/descriptors/derive.test.ts`
Expected: FAIL — cannot resolve `../../src/descriptors/...` (modules not created yet).

- [ ] **Step 3: Create the shared schema constants**

```ts
// package/src/descriptors/schemas.ts
import { Schema } from "effect";

/** @internal */ export const Bool = Schema.Boolean;
/** @internal */ export const Num = Schema.Number;
/** @internal */ export const Str = Schema.String;
/** @internal */ export const StringArray = Schema.Array(Schema.String);
/** @internal */ export const StringRecord = Schema.Record({ key: Schema.String, value: Schema.String });
/** @internal */ export const BooleanRecord = Schema.Record({ key: Schema.String, value: Schema.Boolean });
/** @internal */ export const UnknownRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown });
/** @internal */ export const StringArrayRecord = Schema.Record({ key: Schema.String, value: StringArray });
```

- [ ] **Step 4: Create the descriptor types**

```ts
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
 readonly schema: Schema.Schema<A, unknown>;
 readonly kind: FieldKind;
 readonly strategy: string;
 readonly enforcement: Enforcement;
 readonly doc: string;
 readonly anchor?: string;
 readonly options?: FieldOptions;
 /** Required for kind "enum"/"union"/"object"; synthesized otherwise. */
 readonly samples?: { readonly valid: readonly unknown[]; readonly invalid: readonly unknown[] };
}

/** Wide map type for the derivation helpers. `any` (not `unknown`) sidesteps
 *  Schema's invariance so narrow per-field entries stay assignable. @internal */
export type FieldDescriptors = Record<string, FieldDescriptor<any>>;
```

- [ ] **Step 5: Create the table assembly + derivation helpers**

```ts
// package/src/descriptors/index.ts
import type { Schema } from "effect";
import type { Enforcement } from "../runtime/types.js";
import type { FieldDescriptors } from "./types.js";

// Category modules are merged here as they are added in later tasks.
// (Task 2 adds the migrated 14; Tasks 5-12 add the rest.)
// `satisfies` (never a `: FieldDescriptors` annotation) keeps each entry's
// narrow schema type so the Task 4 drift assertion can read per-field value types.
export const DESCRIPTORS = {} satisfies FieldDescriptors;

/** Derive the per-field validation schemas consumed by freeze(). @internal */
export function deriveSchemas(d: FieldDescriptors): Record<string, Schema.Schema<unknown, unknown>> {
 const out: Record<string, Schema.Schema<unknown, unknown>> = {};
 for (const [field, desc] of Object.entries(d)) out[field] = desc.schema;
 return out;
}

/** Derive the strategy + enforcement registry consumed by freeze(). @internal */
export function deriveRegistry(d: FieldDescriptors): Record<string, { readonly strategy: string; readonly enforcement: Enforcement }> {
 const out: Record<string, { readonly strategy: string; readonly enforcement: Enforcement }> = {};
 for (const [field, desc] of Object.entries(d)) out[field] = { strategy: desc.strategy, enforcement: desc.enforcement };
 return out;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run package/__test__/descriptors/derive.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add package/src/descriptors package/__test__/descriptors/derive.test.ts
git commit -m "feat: descriptor table types + derivation helpers

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 2: Migrate the 14 existing fields into the descriptor table

**Files:**

- Modify: `package/src/descriptors/index.ts` (populate `DESCRIPTORS`)
- Create: `package/src/descriptors/resolution.ts` (holds the 14 to start; later tasks extend it and add sibling modules)
- Modify: `package/src/registry.ts` (re-export derived registry)
- Modify: `package/src/plugin/freeze.ts:30-44` (consume derived schema map) and `:3` (import path)
- Test: existing `package/__test__/plugin/freeze.test.ts`, `package/__test__/parity/*.int.test.ts`

**Interfaces:**

- Consumes: `deriveSchemas`, `deriveRegistry` (Task 1).
- Produces: populated `DESCRIPTORS` containing exactly the 14 parity-locked fields; `FIELD_REGISTRY` (from `registry.ts`) and `FIELD_SCHEMAS` (in `freeze.ts`) now derived.

The 14 fields, copied verbatim (schema from `freeze.ts:30-44`, strategy/enforcement from `registry.ts:10-23`):

| key | schema | kind | strategy | enforcement |
| --- | --- | --- | --- | --- |
| `catalogs` | `Schema.Record({ key: Str, value: StringRecord })` | object | `catalogs` | `warn` |
| `confirmModulesPurge` | `Bool` | boolean | `scalar` | `absent` |
| `packageExtensions` | `UnknownRecord` | unknownRecord | `mapChildWins` | `absent` |
| `allowedDeprecatedVersions` | `StringRecord` | stringRecord | `mapChildWins` | `absent` |
| `publicHoistPattern` | `StringArray` | stringArray | `arrayUnion` | `absent` (`options: { excludeByRepo: true }`) |
| `minimumReleaseAgeExclude` | `StringArray` | stringArray | `arrayUnion` | `absent` |
| `supportedArchitectures` | `StringArrayRecord` | stringArrayRecord | `arrayRecordUnion` | `absent` |
| `auditConfig` | `StringArrayRecord` | stringArrayRecord | `arrayRecordUnion` | `absent` |
| `overrides` | `StringRecord` | stringRecord | `overrides` | `warn` |
| `peerDependencyRules` | `PeerRulesSchema` (see below) | object | `peerDependencyRules` | `warn` |
| `strictDepBuilds` | `Bool` | boolean | `securityFlag` | `warn` |
| `blockExoticSubdeps` | `Bool` | boolean | `securityFlag` | `warn` |
| `minimumReleaseAge` | `Num` | number | `securityMin` | `warn` |
| `allowBuilds` | `BooleanRecord` | booleanRecord | `allowBuilds` | `warn` |

> `catalogs` stays special-cased in `freeze.ts` (its value is `config.catalogs.catalogs`), but it still gets a descriptor entry so derivation and the table-driven suite see it. Keep the explicit `catalogs` decode + manifest line in `freeze.ts` unchanged.

- [ ] **Step 1: Add the 14 entries to a category module**

```ts
// package/src/descriptors/resolution.ts
import { Schema } from "effect";
import { BooleanRecord, Bool, Num, StringArray, StringArrayRecord, StringRecord, Str, UnknownRecord } from "./schemas.js";
import type { FieldDescriptors } from "./types.js";

const PeerRulesSchema = Schema.Struct({
 allowedVersions: Schema.optional(StringRecord),
 ignoreMissing: Schema.optional(StringArray),
 allowAny: Schema.optional(StringArray),
});

/** The 14 parity-locked fields migrated from registry.ts + freeze.ts. @internal */
export const migrated = {
 catalogs: {
  schema: Schema.Record({ key: Str, value: StringRecord }),
  kind: "object",
  strategy: "catalogs",
  enforcement: "warn",
  doc: "Named version catalogs injected into pnpm config.",
  anchor: "catalogs",
  samples: { valid: [{ default: { lodash: "^4" } }], invalid: ["x"] },
 },
 confirmModulesPurge: { schema: Bool, kind: "boolean", strategy: "scalar", enforcement: "absent", doc: "Whether pnpm prompts before purging node_modules (undocumented upstream)." },
 packageExtensions: { schema: UnknownRecord, kind: "unknownRecord", strategy: "mapChildWins", enforcement: "absent", doc: "Per-package manifest overrides merged into the dependency graph.", anchor: "packageextensions" },
 allowedDeprecatedVersions: { schema: StringRecord, kind: "stringRecord", strategy: "mapChildWins", enforcement: "absent", doc: "Deprecated versions explicitly allowed, keyed by package.", anchor: "alloweddeprecatedversions" },
 publicHoistPattern: { schema: StringArray, kind: "stringArray", strategy: "arrayUnion", enforcement: "absent", doc: "Glob patterns hoisted to the root node_modules.", anchor: "publichoistpattern", options: { excludeByRepo: true } },
 minimumReleaseAgeExclude: { schema: StringArray, kind: "stringArray", strategy: "arrayUnion", enforcement: "absent", doc: "Packages excluded from the minimum-release-age quarantine.", anchor: "minimumreleaseageexclude" },
 supportedArchitectures: { schema: StringArrayRecord, kind: "stringArrayRecord", strategy: "arrayRecordUnion", enforcement: "absent", doc: "Supported architectures, keyed by axis (os/cpu/libc).", anchor: "supportedarchitectures" },
 auditConfig: { schema: StringArrayRecord, kind: "stringArrayRecord", strategy: "arrayRecordUnion", enforcement: "absent", doc: "Audit config exclusions, keyed by axis.", anchor: "auditconfig" },
 overrides: { schema: StringRecord, kind: "stringRecord", strategy: "overrides", enforcement: "warn", doc: "Security version overrides, keyed by package selector.", anchor: "overrides" },
 peerDependencyRules: { schema: PeerRulesSchema, kind: "object", strategy: "peerDependencyRules", enforcement: "warn", doc: "Peer dependency rules: allowed versions plus ignore/allow-any lists.", anchor: "peerdependencyrules", samples: { valid: [{ allowedVersions: { react: "18" } }, {}], invalid: ["x"] } },
 strictDepBuilds: { schema: Bool, kind: "boolean", strategy: "securityFlag", enforcement: "warn", doc: "Whether dependency build scripts are blocked unless explicitly allowed.", anchor: "strictdepbuilds" },
 blockExoticSubdeps: { schema: Bool, kind: "boolean", strategy: "securityFlag", enforcement: "warn", doc: "Whether exotic (non-registry) subdependencies are blocked.", anchor: "blockexoticsubdeps" },
 minimumReleaseAge: { schema: Num, kind: "number", strategy: "securityMin", enforcement: "warn", doc: "Minimum age (minutes) a release must reach before it is installable.", anchor: "minimumreleaseage" },
 allowBuilds: { schema: BooleanRecord, kind: "booleanRecord", strategy: "allowBuilds", enforcement: "warn", doc: "Packages whose build scripts are explicitly allowed to run.", anchor: "allowbuilds" },
} satisfies FieldDescriptors;
```

- [ ] **Step 2: Wire the module into `DESCRIPTORS`**

```ts
// package/src/descriptors/index.ts  — replace the empty literal
import { migrated } from "./resolution.js";
export const DESCRIPTORS = { ...migrated } satisfies FieldDescriptors;
```

- [ ] **Step 3: Derive `FIELD_REGISTRY` in `registry.ts`**

```ts
// package/src/registry.ts  — full replacement
import { DESCRIPTORS, deriveRegistry } from "./descriptors/index.js";

/** Maps each known pnpm field to its strategy + default enforcement. Derived from the descriptor table. @internal */
export const FIELD_REGISTRY = deriveRegistry(DESCRIPTORS);
```

- [ ] **Step 4: Derive `FIELD_SCHEMAS` in `freeze.ts`**

In `package/src/plugin/freeze.ts`: delete the local schema constants and the `FIELD_SCHEMAS` literal (`:13-44`), and replace with a derived import. Keep `CatalogsSchema` for the special-cased catalogs decode, or source it from the descriptor. Minimal change:

```ts
// near top of freeze.ts
import { DESCRIPTORS, deriveSchemas } from "../descriptors/index.js";
// ...
const FIELD_SCHEMAS = deriveSchemas(DESCRIPTORS);
const CatalogsSchema = FIELD_SCHEMAS.catalogs; // same shape as before
```

Leave the `freeze` body (`:82-112`) unchanged — it already iterates `FIELD_REGISTRY` and looks up `FIELD_SCHEMAS[field]`.

- [ ] **Step 5: Run the existing unit + parity suites to verify no behavior change**

Run: `pnpm vitest run package/__test__/plugin/freeze.test.ts package/__test__/parity`
Expected: PASS — including the parity suite when the Silk oracle is present (locally). Byte-identical `{ base, manifest }` proves the migration changed nothing.

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package/src package/__test__
git commit -m "refactor: migrate 14 managed fields to descriptor table (parity-locked)

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 3: Table-driven field test harness

**Files:**

- Create: `package/__test__/descriptors/table.test.ts`
- Create: `package/__test__/descriptors/samples.ts` (sample synthesis by kind)

**Interfaces:**

- Consumes: `DESCRIPTORS`, `STRATEGY_TABLE` (from `package/src/runtime/strategies/table.ts`).
- Produces: `samplesFor(desc): { valid; invalid }` — uses `desc.samples` if present, else synthesizes from `desc.kind`; throws for `enum`/`union`/`object` lacking explicit samples.

- [ ] **Step 1: Write the sample synthesizer**

```ts
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

export function samplesFor(desc: FieldDescriptor): { valid: readonly unknown[]; invalid: readonly unknown[] } {
 if (desc.samples) return desc.samples;
 const synth = BY_KIND[desc.kind];
 if (!synth) throw new Error(`Descriptor kind "${desc.kind}" requires explicit samples`);
 return synth;
}
```

- [ ] **Step 2: Write the table-driven suite (failing if any field is misconfigured)**

```ts
// package/__test__/descriptors/table.test.ts
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { DESCRIPTORS } from "../../src/descriptors/index.js";
import { STRATEGY_TABLE } from "../../src/runtime/strategies/table.js";
import { samplesFor } from "./samples.js";

describe("descriptor table integrity", () => {
 for (const [field, desc] of Object.entries(DESCRIPTORS)) {
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
```

- [ ] **Step 3: Run to verify it passes for the 14 migrated fields**

Run: `pnpm vitest run package/__test__/descriptors/table.test.ts`
Expected: PASS — every migrated field has a known strategy and accepts/rejects its samples.

- [ ] **Step 4: Commit**

```bash
git add package/__test__/descriptors/table.test.ts package/__test__/descriptors/samples.ts
git commit -m "test: table-driven descriptor integrity suite

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 4: Hand-authored PluginConfig + compile-time drift assertion

**Files:**

- Create: `package/__test__/types/plugin-config.test-d.ts`
- Modify: `package/src/define-plugin.ts` (no field changes yet; add the derived-type export wiring)

**Interfaces:**

- Produces: `DerivedPluginConfig` (mapped type over `DESCRIPTORS`); a type-level assertion that, for every descriptor key, the hand-authored `PluginConfig` value type and the descriptor-derived value type are **mutually assignable** (value-level drift detection, not just key coverage).

> Two keys are value-excluded (key-checked only): `catalogs` (authored type is `CatalogsResult`, not the raw schema type) and `publicHoistPattern` (authored type carries the `excludeByRepo` refine the schema does not model). Every other key is value-checked.
>
> Mutual assignability (`A extends B` AND `B extends A`) — not strict `Equal` — is deliberate: it tolerates cosmetic differences (e.g. Effect's `{ readonly [x: string]: T }` vs `Record<string, T>`) while still catching real drift such as `string` authored against a `Schema.Literal(...)` union.

- [ ] **Step 1: Write the type-level assertion**

```ts
// package/__test__/types/plugin-config.test-d.ts
import type { Schema } from "effect";
import { DESCRIPTORS } from "../../src/descriptors/index.js";
import type { FieldInput, PluginConfig } from "../../src/define-plugin.js";

type Descriptors = typeof DESCRIPTORS;
type SchemaType<K extends keyof Descriptors> = Schema.Schema.Type<Descriptors[K]["schema"]>;

// Keys checked for key-coverage only (value type intentionally not compared).
type ValueExcluded = "catalogs" | "publicHoistPattern";

// Derived authoring surface for the value-checked keys.
type DerivedPluginConfig = {
 [K in Exclude<keyof Descriptors, ValueExcluded>]?: FieldInput<SchemaType<K>>;
};

type Expect<T extends true> = T;
// Mutual assignability: true iff A and B are assignable to each other. Tolerant
// of readonly / Record-vs-index-signature differences; catches real widening.
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// 1) Key coverage: PluginConfig's keys (minus catalogs) exactly equal the
//    value-checked descriptor keys plus publicHoistPattern.
type AuthoredKeys = Exclude<keyof PluginConfig, "catalogs">;
type DerivedKeys = keyof DerivedPluginConfig | "publicHoistPattern";
type _AssertKeyCoverage = Expect<Mutual<AuthoredKeys, DerivedKeys>>;

// 2) Value-level: for each value-checked key, authored and derived value types
//    are mutually assignable. A `string` authored against a literal union, or a
//    missing field, collapses the aggregate below to `never`/`false`.
type ValueDrift = {
 [K in Exclude<keyof Descriptors, ValueExcluded>]: K extends keyof PluginConfig
  ? Mutual<NonNullable<PluginConfig[K]>, NonNullable<DerivedPluginConfig[K]>>
  : false;
};
type _AssertNoValueDrift = Expect<{ [K in keyof ValueDrift]: ValueDrift[K] extends true ? true : never }[keyof ValueDrift] extends true ? true : false>;
```

- [ ] **Step 2: Run typecheck and prove the guard bites**

Run: `pnpm run typecheck`
Expected: PASS for the 14 already-in-sync fields (the guard is established, not red here). To prove it catches drift, temporarily widen one authored field (e.g. change `strictDepBuilds?: FieldInput<boolean>` to `FieldInput<string>`, or delete the field) and re-run — typecheck MUST FAIL on `_AssertNoValueDrift` or `_AssertKeyCoverage`; then revert. Record this red/green check in the report.

> Note: this task establishes the guard; Tasks 5–12 each re-run it after adding fields, so the guard does real work as the table grows.

- [ ] **Step 3: Ensure the test file is picked up by the type-check project**

Confirm `tsconfig`/vitest type-test globbing includes `package/__test__/**/*.test-d.ts`. If `*.test-d.ts` is not already compiled, add it to the typecheck `include`. Run `pnpm run typecheck` again; expected PASS.

- [ ] **Step 4: Commit**

```bash
git add package/__test__/types/plugin-config.test-d.ts package/src/define-plugin.ts
git commit -m "test: compile-time drift assertion for PluginConfig vs descriptors

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Field-addition tasks (5–12)

Each task follows the **same loop**: add descriptor entries to the named category module, register the module in `index.ts`, add the matching fields to the hand-authored `PluginConfig`, run the table-driven suite + typecheck, commit. The schema expression, strategy, and enforcement for every field are given in full per-task tables — these are the actual content to type. Shared schema constants come from `./schemas.js`. `doc` = the one-line pnpm.io description for the field's anchor (anchor = key lowercased). `scalar` strategy + `absent` enforcement unless noted. "sec" → `warn` enforcement.

**Loop steps (apply to each of Tasks 5–12):**

- [ ] **A.** Add the entries (table below) to the category module as `export const <cat> = { ... } satisfies FieldDescriptors;` (use `satisfies`, never a `: FieldDescriptors` annotation, so per-field schema types are preserved for the drift assertion).
- [ ] **B.** Add `export const <cat>` and spread it into `DESCRIPTORS` in `index.ts`.
- [ ] **C.** Add each field to `PluginConfig` in `define-plugin.ts` with `FieldInput<T>` (T per the table's TS type) and a JSDoc line.
- [ ] **D.** Run `pnpm vitest run package/__test__/descriptors/table.test.ts` → PASS (new fields validated).
- [ ] **E.** Run `pnpm run typecheck` → PASS (drift assertion confirms parity).
- [ ] **F.** Commit `feat: add <category> pnpm settings fields` with DCO signoff.

Enum/union/object fields **must** include explicit `samples` (the table gives them). Schema expressions: enum = `Schema.Literal(...)`; union = `Schema.Union(...)`; record-of-X = the shared constant.

---

### Task 5: Resolution remainder + trust + catalog fields

**Files:** Modify `package/src/descriptors/resolution.ts`, `index.ts`, `define-plugin.ts`. Test via table suite + typecheck.

| key | schema | kind | strategy | enforce | TS type | samples (enum/union/object) |
| --- | --- | --- | --- | --- | --- | --- |
| `ignoredOptionalDependencies` | `StringArray` | stringArray | `arrayUnion` | absent | `string[]` | — |
| `updateConfig` | `Schema.Struct({ ignoreDependencies: Schema.optional(StringArray) })` | object | `mapChildWins` | absent | `{ ignoreDependencies?: string[] }` | valid `[{}, { ignoreDependencies: ["a"] }]`, invalid `["x"]` |
| `catalog` | `StringRecord` | stringRecord | `mapChildWins` | warn | `Record<string,string>` | — |
| `minimumReleaseAgeStrict` | `Bool` | boolean | `scalar` | warn (sec) | `boolean` | — |
| `minimumReleaseAgeIgnoreMissingTime` | `Bool` | boolean | `scalar` | warn (sec) | `boolean` | — |
| `trustPolicy` | `Schema.Literal("off","no-downgrade")` | enum | `scalar` | warn (sec) | `"off"  or "no-downgrade"` | valid `["off"]`, invalid `["x"]` |
| `trustPolicyExclude` | `StringArray` | stringArray | `arrayUnion` | warn (sec) | `string[]` | — |
| `trustPolicyIgnoreAfter` | `Num` | number | `scalar` | warn (sec) | `number` | — |
| `trustLockfile` | `Bool` | boolean | `scalar` | warn (sec) | `boolean` | — |

> Implementation note (spec open question): `catalog` (singular) uses `mapChildWins`/`warn` for now. If override-detection like `catalogs` is wanted, that is a follow-up — do not build a new strategy in this task.

---

### Task 6: Hoisting + node-modules + store fields

**Files:** Create `package/src/descriptors/hoisting.ts`; modify `index.ts`, `define-plugin.ts`.

| key | schema | kind | strat | enforce | TS type | samples |
| --- | --- | --- | --- | --- | --- | --- |
| `hoist` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `hoistWorkspacePackages` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `hoistPattern` | `StringArray` | stringArray | arrayUnion | absent | `string[]` | — |
| `shamefullyHoist` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `hoistingLimits` | `Schema.Literal("none","workspaces","dependencies")` | enum | scalar | absent | `"none" or "workspaces" or "dependencies"` | valid `["none"]`, invalid `["x"]` |
| `modulesDir` | `Str` | string | scalar | absent | `string` | — |
| `nodeLinker` | `Schema.Literal("isolated","hoisted","pnp")` | enum | scalar | absent | `"isolated" or "hoisted" or "pnp"` | valid `["isolated"]`, invalid `["x"]` |
| `symlink` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `enableModulesDir` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `virtualStoreDir` | `Str` | string | scalar | absent | `string` | — |
| `virtualStoreDirMaxLength` | `Num` | number | scalar | absent | `number` | — |
| `virtualStoreOnly` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `packageImportMethod` | `Schema.Literal("auto","hardlink","copy","clone","clone-or-copy")` | enum | scalar | absent | union | valid `["auto"]`, invalid `["x"]` |
| `modulesCacheMaxAge` | `Num` | number | scalar | absent | `number` | — |
| `dlxCacheMaxAge` | `Num` | number | scalar | absent | `number` | — |
| `verifyStoreIntegrity` | `Bool` | boolean | scalar | warn (sec) | `boolean` | — |
| `strictStorePkgContentCheck` | `Bool` | boolean | scalar | warn (sec) | `boolean` | — |

> `hoistingLimits` enum values: pnpm.io documents `none`/`workspaces`/`dependencies`; schemastore lists `node`/`workspaces`/`dependencies`. Use pnpm.io (`none`). Verify against the installed pnpm at implementation time; adjust the literal if it differs and note in the coverage doc.

---

### Task 7: Lockfile + peers fields

**Files:** Create `package/src/descriptors/lockfile.ts`; modify `index.ts`, `define-plugin.ts`.

| key | schema | kind | strat | enforce | TS type | samples |
| --- | --- | --- | --- | --- | --- | --- |
| `lockfile` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `preferFrozenLockfile` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `lockfileIncludeTarballUrl` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `gitBranchLockfile` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `mergeGitBranchLockfilesBranchPattern` | `StringArray` | stringArray | arrayUnion | absent | `string[]` | — |
| `peersSuffixMaxLength` | `Num` | number | scalar | absent | `number` | — |
| `sharedWorkspaceLockfile` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `autoInstallPeers` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `dedupePeerDependents` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `dedupePeers` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `strictPeerDependencies` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `resolvePeersFromWorkspaceRoot` | `Bool` | boolean | scalar | absent | `boolean` | — |

---

### Task 8: Build / scripts + patches + injection fields

**Files:** Create `package/src/descriptors/build.ts`; modify `index.ts`, `define-plugin.ts`.

| key | schema | kind | strat | enforce | TS type | samples |
| --- | --- | --- | --- | --- | --- | --- |
| `onlyBuiltDependencies` | `StringArray` | stringArray | arrayUnion | warn (sec) | `string[]` | — |
| `onlyBuiltDependenciesFile` | `Str` | string | scalar | warn (sec) | `string` | — |
| `neverBuiltDependencies` | `StringArray` | stringArray | arrayUnion | absent | `string[]` | — |
| `ignoredBuiltDependencies` | `StringArray` | stringArray | arrayUnion | absent | `string[]` | — |
| `dangerouslyAllowAllBuilds` | `Bool` | boolean | scalar | warn (sec) | `boolean` | — |
| `ignoreScripts` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `ignoreDepScripts` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `childConcurrency` | `Num` | number | scalar | absent | `number` | — |
| `sideEffectsCache` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `sideEffectsCacheReadonly` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `nodeOptions` | `Str` | string | scalar | absent | `string` | — |
| `verifyDepsBeforeRun` | `Schema.Union(Schema.Literal("install","warn","error","prompt"), Schema.Boolean)` | union | scalar | absent | `"install" or "warn" or "error" or "prompt" or boolean` | valid `["install", false]`, invalid `["x"]` |
| `enablePrePostScripts` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `scriptShell` | `Str` | string | scalar | absent | `string` | — |
| `shellEmulator` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `requiredScripts` | `StringArray` | stringArray | arrayUnion | absent | `string[]` | — |
| `patchedDependencies` | `StringRecord` | stringRecord | mapChildWins | warn | `Record<string,string>` | — |
| `allowUnusedPatches` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `allowNonAppliedPatches` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `ignorePatchFailures` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `patchesDir` | `Str` | string | scalar | absent | `string` | — |
| `configDependencies` | `StringRecord` | stringRecord | mapChildWins | absent | `Record<string,string>` | — |
| `executionEnv` | `UnknownRecord` | unknownRecord | mapChildWins | absent | `Record<string,unknown>` | — |
| `injectWorkspacePackages` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `syncInjectedDepsAfterScripts` | `StringArray` | stringArray | arrayUnion | absent | `string[]` | — |
| `dedupeInjectedDeps` | `Bool` | boolean | scalar | absent | `boolean` | — |

> Nested-object merge depth (spec open question): `updateConfig`, `executionEnv`, `configDependencies` use `mapChildWins` (shallow child-wins). Confirm shallow merge is acceptable; if a field needs deep merge, that is a separate strategy task, out of scope here.

---

### Task 9: Package-manager version + node-version fields

**Files:** Create `package/src/descriptors/runtime-cfg.ts`; modify `index.ts`, `define-plugin.ts`.

| key | schema | kind | strat | enforce | TS type | samples |
| --- | --- | --- | --- | --- | --- | --- |
| `packageManagerStrict` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `packageManagerStrictVersion` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `managePackageManagerVersions` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `pmOnFail` | `Schema.Literal("download","error","warn","ignore")` | enum | scalar | absent | union | valid `["download"]`, invalid `["x"]` |
| `runtimeOnFail` | `Schema.Literal("download","error","warn","ignore")` | enum | scalar | absent | union | valid `["error"]`, invalid `["x"]` |
| `nodeVersion` | `Str` | string | scalar | absent | `string` | — |
| `useNodeVersion` | `Str` | string | scalar | absent | `string` | — |
| `nodeDownloadMirrors` | `UnknownRecord` | unknownRecord | mapChildWins | absent | `Record<string,unknown>` | — |

---

### Task 10: Catalog + workspace + audit fields

**Files:** Create `package/src/descriptors/workspace.ts`; modify `index.ts`, `define-plugin.ts`.

| key | schema | kind | strat | enforce | TS type | samples |
| --- | --- | --- | --- | --- | --- | --- |
| `catalogMode` | `Schema.Literal("strict","prefer","manual")` | enum | scalar | absent | union | valid `["manual"]`, invalid `["x"]` |
| `cleanupUnusedCatalogs` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `linkWorkspacePackages` | `Schema.Union(Schema.Boolean, Schema.Literal("deep"))` | union | scalar | absent | `boolean or "deep"` | valid `[true, "deep"]`, invalid `["x"]` |
| `preferWorkspacePackages` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `saveWorkspaceProtocol` | `Schema.Union(Schema.Boolean, Schema.Literal("rolling"))` | union | scalar | absent | `boolean or "rolling"` | valid `[false, "rolling"]`, invalid `["x"]` |
| `includeWorkspaceRoot` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `ignoreWorkspaceCycles` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `disallowWorkspaceCycles` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `workspaceConcurrency` | `Num` | number | scalar | absent | `number` | — |
| `auditLevel` | `Schema.Literal("low","moderate","high","critical")` | enum | scalar | absent | union | valid `["low"]`, invalid `["x"]` |

---

### Task 11: Resolution/misc preference fields

**Files:** Create `package/src/descriptors/misc.ts`; modify `index.ts`, `define-plugin.ts`.

| key | schema | kind | strat | enforce | TS type | samples |
| --- | --- | --- | --- | --- | --- | --- |
| `resolutionMode` | `Schema.Literal("highest","time-based","lowest-direct")` | enum | scalar | absent | union | valid `["highest"]`, invalid `["x"]` |
| `savePrefix` | `Schema.Literal("^","~","")` | enum | scalar | absent | `"^" or "~" or ""` | valid `["^"]`, invalid `["x"]` |
| `saveExact` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `tag` | `Str` | string | scalar | absent | `string` | — |
| `preferOffline` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `dedupeDirectDeps` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `deployAllFiles` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `forceLegacyDeploy` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `extendNodePath` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `preferSymlinkedExecutables` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `ignoreCompatibilityDb` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `optimisticRepeatInstall` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `recursiveInstall` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `engineStrict` | `Bool` | boolean | scalar | absent | `boolean` | — |

---

### Task 12: Network tuning + publish fields

**Files:** Create `package/src/descriptors/network.ts`; modify `index.ts`, `define-plugin.ts`.

| key | schema | kind | strat | enforce | TS type | samples |
| --- | --- | --- | --- | --- | --- | --- |
| `networkConcurrency` | `Num` | number | scalar | absent | `number` | — |
| `fetchRetries` | `Num` | number | scalar | absent | `number` | — |
| `fetchRetryFactor` | `Num` | number | scalar | absent | `number` | — |
| `fetchRetryMintimeout` | `Num` | number | scalar | absent | `number` | — |
| `fetchRetryMaxtimeout` | `Num` | number | scalar | absent | `number` | — |
| `fetchTimeout` | `Num` | number | scalar | absent | `number` | — |
| `gitShallowHosts` | `StringArray` | stringArray | arrayUnion | absent | `string[]` | — |
| `provenance` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `gitChecks` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `embedReadme` | `Bool` | boolean | scalar | absent | `boolean` | — |
| `publishBranch` | `Str` | string | scalar | absent | `string` | — |

After this task, run the **full** suite + parity to confirm nothing regressed:
Run: `pnpm run typecheck && pnpm vitest run package/__test__` — Expected: PASS (table suite covers ~120 fields; parity still green).

---

### Task 13: Coverage matrix design doc

**Files:** Create `.claude/design/rolldown-pnpm-config/settings-coverage.md`.

- [ ] **Step 1: Generate the matrix from the live table**

Write a one-off script (or inline node) that imports `DESCRIPTORS` and emits a markdown table (`key | type/kind | strategy | enforcement | anchor`) for covered fields, plus the static "not covered" table from the spec. Save to `.claude/design/rolldown-pnpm-config/settings-coverage.md`. Include the header note: schemastore may be stale; pnpm.io wins on conflict; `confirmModulesPurge` undocumented upstream.

- [ ] **Step 2: Lint markdown**

Run: `pnpm run lint:md`
Expected: PASS (fix table spacing / code-fence language as needed).

- [ ] **Step 3: Commit**

```bash
git add .claude/design/rolldown-pnpm-config/settings-coverage.md
git commit -m "docs: pnpm settings coverage matrix (design doc)

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 14: User-facing docs page

**Files:** Create `docs/pnpm-settings-coverage.md` (plain GitHub markdown — NOT rspress).

- [ ] **Step 1: Write the page**

A reader-facing page: intro paragraph, a "Supported settings" section grouped by category with each key linking to `https://pnpm.io/settings#<anchor>` and showing its default enforcement, and an "Unsupported settings" section (from the spec's not-covered table) with the reason each is excluded. Note `confirmModulesPurge` is supported but undocumented upstream (no link). Link to the design matrix for the authoritative source.

- [ ] **Step 2: Lint markdown**

Run: `pnpm run lint:md`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/pnpm-settings-coverage.md
git commit -m "docs: user-facing supported/unsupported pnpm settings page

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 15: Final verification

- [ ] **Step 1: Full typecheck, tests, lint, build**

Run: `pnpm run typecheck && pnpm vitest run && pnpm run lint && pnpm run lint:md && pnpm run build`
Expected: all PASS. The parity suite (when the Silk oracle is present) is green, proving the 14 migrated fields are byte-identical to Silk.

- [ ] **Step 2: Confirm coverage counts**

Inline-check `Object.keys(DESCRIPTORS).length` equals the covered-field count in the matrix (~120). Update the matrix/doc if they disagree.

- [ ] **Step 3: Update project memory note (optional)**

If desired, note in `.claude/.../memory` that Phase 3 field-registry expansion has landed.

---

## Self-Review

**Spec coverage:**

- Descriptor table as single source of truth → Tasks 1–2. ✓
- Derive `FIELD_SCHEMAS`/`FIELD_REGISTRY` → Task 2. ✓
- Category-module organization → Tasks 5–12 (resolution, hoisting, lockfile, build, runtime-cfg, workspace, misc, network). ✓
- Migrate 14 parity-locked → Task 2; parity safety net → Tasks 2, 12, 15. ✓
- Hybrid authoring types + drift assertion → Task 4 (re-run in 5–12). ✓
- Enforcement default policy (security=warn, rest=absent) → encoded in every field table. ✓
- No new strategies → asserted by Task 3 (strategy must exist in `STRATEGY_TABLE`). ✓
- Table-driven + bespoke testing → Task 3 (table-driven); bespoke `excludeByRepo`/security-box/override-detection tests already exist for the 14 and remain green (Task 2/15). ✓
- Full coverage matrix in design docs → Task 13. ✓
- User-facing docs (GitHub markdown under `docs/`, anchors, confirmModulesPurge note) → Task 14. ✓
- All covered groups incl. network tuning + publish (opted in) → Tasks 5–12. ✓

**Placeholder scan:** every field table gives the exact schema expression, strategy, enforcement, TS type, and (for enum/union/object) explicit samples. `doc` strings sourced from pnpm.io anchors per the global constraint. No "TBD"/"handle edge cases".

**Type consistency:** `FieldDescriptor`/`FieldDescriptors`/`deriveSchemas`/`deriveRegistry`/`samplesFor`/`DerivedPluginConfig` names are used identically across Tasks 1–12. Shared schema constants (`Bool`, `Num`, `Str`, `StringArray`, `StringRecord`, `BooleanRecord`, `UnknownRecord`, `StringArrayRecord`) are defined once in Task 1 and referenced everywhere.

**Fix applied during review:** Task 13 file path corrected to `.claude/design/rolldown-pnpm-config/settings-coverage.md`.

**Open questions carried from spec (not blockers):** `catalog` singular strategy (Task 5 note), nested-merge depth (Task 8 note), `hoistingLimits` enum values (Task 6 note) — each flagged inline for the implementer to confirm against installed pnpm.
