---
type: DataModel
title: Descriptor table
description: The maintainer-side shape of one FieldDescriptor entry, the eight category modules it is authored across, what freeze and the runtime registry derive from it, and the compile-time guard that keeps the hand-authored PluginConfig interface honest against it.
resource: ../../package/src/descriptors/index.ts
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: types-ts
    resource: ../../package/src/descriptors/types.ts
  - id: index-ts
    resource: ../../package/src/descriptors/index.ts
  - id: registry-ts
    resource: ../../package/src/registry.ts
  - id: freeze-ts
    resource: ../../package/src/plugin/freeze.ts
  - id: drift-guard-test
    resource: ../../package/__test__/types/plugin-config.test-d.ts
---

# Descriptor table

This document is the maintainer's side of the descriptor table: what one
entry contains, how the 121 entries are authored and merged, what is
mechanically derived from them, and what breaks if an entry is wrong. For
the consumer-facing coverage promise the table backs — which of the 121
pnpm fields are managed and how — see
[managed pnpm fields](../interfaces/managed-pnpm-fields.md); this document
does not repeat that enumeration.

## The `FieldDescriptor<A>` shape

Defined in `package/src/descriptors/types.ts:25-38`. One entry carries:

- `schema: Schema.Codec<A, any>` — the validation/decode codec for the
  field's authored value.[^types-ts]
- `kind: FieldKind` — a rendering/sample-synthesis tag (`"boolean"`,
  `"number"`, `"string"`, `"enum"`, `"union"`, `"stringArray"`,
  `"stringRecord"`, `"booleanRecord"`, `"unknownRecord"`,
  `"stringArrayRecord"`, `"object"`), used for doc rendering and default
  test-sample synthesis.[^types-ts]
- `strategy: string` — the merge strategy name the runtime registry looks
  up.[^types-ts]
- `enforcement: Enforcement` — the default enforcement level.[^types-ts]
- `doc: string` — the field's documentation string.[^types-ts]
- `workspaceYaml: boolean` — whether the field is valid in
  `pnpm-workspace.yaml`, and thus exportable.[^types-ts]
- `anchor?: string` — optional.[^types-ts]
- `options?: FieldOptions` — optional per-field runtime refine data, plain
  data only, never code; currently just `excludeByRepo?: boolean`.[^types-ts]
- `samples?: { valid, invalid }` — required for `kind` `"enum"`, `"union"`,
  or `"object"`; synthesized otherwise.[^types-ts]

`FieldDescriptors` is the wide map type (`Record<string, FieldDescriptor<any>>`)
the derivation helpers operate over; it deliberately uses `any` rather than
`unknown` so Schema's invariance does not reject narrow per-field entries as
unassignable.[^types-ts]

## Authoring split: eight category modules

Entries are authored across eight category modules — `resolution.ts`,
`hoisting.ts`, `lockfile.ts`, `build.ts`, `runtime-cfg.ts`, `workspace.ts`,
`misc.ts`, `network.ts` — each exporting its slice of the table, merged with
`satisfies FieldDescriptors` (never a `: FieldDescriptors` type annotation)
into one `DESCRIPTORS` object in `package/src/descriptors/index.ts:17-26`.[^index-ts]
The `satisfies` form is load-bearing: an explicit annotation would widen
every entry to the annotation's type and erase the narrow per-field schema
type the compile-time drift guard depends on to read per-field value
types.[^index-ts]

## What is derived from the table

Nothing downstream hand-lists fields a second time:

- `deriveSchemas(DESCRIPTORS)` (`index.ts:29-33`) walks every entry and
  produces `FIELD_SCHEMAS`, a `Record<string, Schema.Codec<unknown, unknown>>`
  keyed by field name.[^index-ts] `package/src/plugin/freeze.ts:17-18,78`
  assigns this to a module-level `FIELD_SCHEMAS` constant and looks up each
  field's schema from it during validation, including pulling
  `CatalogsSchema` off it by key.[^freeze-ts]
- `deriveRegistry(DESCRIPTORS)` (`index.ts:36-43`) walks every entry and
  produces `FIELD_REGISTRY`, a `Record<string, { strategy, enforcement }>`
  map.[^index-ts] `package/src/registry.ts` is reduced to importing
  `DESCRIPTORS` and `deriveRegistry` and exporting the one derived
  constant — the whole file is an import line, a doc comment, and one
  `export const FIELD_REGISTRY = deriveRegistry(DESCRIPTORS);`
  statement.[^registry-ts]

## The parallel hand-authored `PluginConfig` interface

`PluginConfig` (`package/src/define-plugin.ts`) is not derived — it is a
second, hand-authored surface an author writes against. Because it is
hand-authored, it can silently drift from `DESCRIPTORS`: a field could be
widened, narrowed, or dropped from one side without the other noticing.

The compile-time drift guard at
`package/__test__/types/plugin-config.test-d.ts` closes that gap with two
assertions run under `typecheck`, not the runtime test pass:

1. **Key coverage** (`_AssertKeyCoverage`, lines 44-49) — `PluginConfig`'s
   keys, minus `catalogs`, the export-only `local` key, and the
   metadata-only `name` key, must be mutually assignable to the
   value-checked descriptor keys plus `publicHoistPattern` and
   `peerDependencyRules`.[^drift-guard-test]
2. **Value-level drift** (`_AssertNoValueDrift`, lines 51-66) — for every
   descriptor key not in the exemption list, the authored `PluginConfig`
   value type and the schema-decoded `Descriptors[K]["schema"]["Type"]`
   must be mutually assignable after a `DeepMutable` normalization that
   strips purely cosmetic differences (`readonly` arrays, index-signature
   vs `Record`, the `| undefined` an Effect `Schema.optional` adds) without
   touching real element or value types.[^drift-guard-test] The
   per-key results are aggregated by union rather than mapped to `never`,
   because `never` is absorbed by a union and would make the guard
   vacuously pass.[^drift-guard-test]

### The three key-checked-only exemptions

`ValueExcluded` (`plugin-config.test-d.ts:12`) names three fields the
value-level assertion skips, checking only that the key exists:

- **`catalogs`** — authored as inline declarations rather than through the
  descriptor schema shape, so there is no descriptor-derived value type to
  compare against.[^drift-guard-test]
- **`publicHoistPattern`** — carries the `excludeByRepo` refine
  (`FieldOptions.excludeByRepo`) that the schema itself does not
  model.[^drift-guard-test]
- **`peerDependencyRules`** — carries the build-time
  `allowedVersionsFromCatalogs` directive, resolved in
  `package/src/plugin/allowed-versions.ts` and baked into the base at
  freeze time, which the schema does not model.[^drift-guard-test]

Each is exempt from the *value* check only — all three still participate in
key coverage, so removing one of them from `PluginConfig` entirely still
fails the guard.[^drift-guard-test]

## What breaks if an entry is wrong

- **Wrong `schema`** — `freeze` validates the authored value against the
  wrong shape: either rejecting valid config or silently accepting invalid
  config, since `FIELD_SCHEMAS` is looked up by field name at
  validation time.[^freeze-ts]
- **Wrong `strategy` or `enforcement`** — `FIELD_REGISTRY` feeds the
  runtime's merge behavior; a wrong strategy name changes how the field is
  combined across catalog-dependency plugins (or fails to resolve a
  strategy at all), and a wrong `enforcement` silently changes whether a
  conflict warns or errors.
- **Dropping an entry entirely** — the field vanishes from both
  `FIELD_SCHEMAS` and `FIELD_REGISTRY` simultaneously, since both are
  derived from the same `DESCRIPTORS` object; nothing downstream can
  validate or merge it, and it also drops out of `PluginConfig`'s key
  coverage, which the drift guard catches at `typecheck` rather than
  letting it surface as a runtime gap.[^drift-guard-test]
- **Widening or narrowing an entry's `schema` without updating
  `PluginConfig`, or vice versa** — caught by the drift guard's
  value-level assertion at `typecheck`, except for the three key-checked-only
  fields, which cannot be caught this way because the schema does not model
  their authored shape at all.[^drift-guard-test]

[^types-ts]: types-ts
[^index-ts]: index-ts
[^registry-ts]: registry-ts
[^freeze-ts]: freeze-ts
[^drift-guard-test]: drift-guard-test
