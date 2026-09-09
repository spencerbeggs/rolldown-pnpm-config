---
type: Decision
title: Descriptor table as the single source of truth
description: One declarative entry per managed pnpm field; deriveSchemas and deriveRegistry produce what code consumes, kept honest by a satisfies-based drift guard.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: descriptors-index
    resource: package/src/descriptors/index.ts
  - id: descriptors-types
    resource: package/src/descriptors/types.ts
  - id: registry
    resource: package/src/registry.ts
  - id: drift-guard
    resource: package/__test__/types/plugin-config.test-d.ts
  - id: table-test
    resource: package/__test__/descriptors/table.test.ts
---

# Descriptor table as the single source of truth

## Context

The managed field surface spans 121 pnpm fields (`package/src/descriptors/`
merges eight category modules — resolution, hoisting, lockfile, build,
runtime-cfg, workspace, misc, network — into `DESCRIPTORS`,
`package/src/descriptors/index.ts:17-26`). Hand-listing that many fields
across several parallel places (an authoring interface, a validation schema
map, a strategy/enforcement registry) does not scale and invites silent
drift between what an author can declare and what the runtime actually
validates or merges.

## Decision

Each managed pnpm field is one entry in a declarative descriptor table:
`FieldDescriptor<A>` carries `schema`, `kind`, `strategy`, `enforcement`,
`doc`, `workspaceYaml`, and optional `anchor`/`options`/`samples`
(`package/src/descriptors/types.ts:25-38`).[^descriptors-types] The category
modules are merged with `satisfies FieldDescriptors` (never a
`: FieldDescriptors` annotation) into one `DESCRIPTORS` object
(`package/src/descriptors/index.ts:17-26`).[^descriptors-index] The
`satisfies` form is load-bearing: an explicit type annotation would widen
every entry to that annotation's type, while `satisfies` preserves each
entry's narrow schema type so the compile-time drift guard can read
per-field value types.

What code consumes is derived from the table, not hand-listed:
`deriveSchemas` produces the per-field validation schemas consumed by
`freeze`, and `deriveRegistry` produces the strategy/enforcement registry
(`package/src/descriptors/index.ts:29-43`).[^descriptors-index]
`package/src/registry.ts` re-exports `deriveRegistry(DESCRIPTORS)` as
`FIELD_REGISTRY` directly, with no hand-listed fields.[^registry]

The hand-authored `PluginConfig` interface is kept honest by a value-level
drift guard at `package/__test__/types/plugin-config.test-d.ts`: a
compile-time assertion that each authored field's type and its
descriptor-derived type are mutually assignable
(`package/__test__/types/plugin-config.test-d.ts:44-66`), so widening an
authored field or dropping one breaks `typecheck`.[^drift-guard] Three keys
are checked for key-coverage only, not value type — `catalogs`,
`publicHoistPattern` (carries the `excludeByRepo` refine the schema does
not model), and `peerDependencyRules` (carries the build-time
`allowedVersionsFromCatalogs` directive the schema does not model)
(`package/__test__/types/plugin-config.test-d.ts:8-12`).[^drift-guard]
Every descriptor is also exercised by a table-driven suite asserting its
`strategy` names a real entry in `STRATEGY_TABLE` and that its schema
accepts/rejects the declared samples
(`package/__test__/descriptors/table.test.ts:9-26`).[^table-test]

The 14 original Silk fields were migrated into the table parity-locked —
strategy and enforcement preserved verbatim (see, e.g., the parity-locked
dependency-resolution fields noted in `package/src/descriptors/resolution.ts:22`)
— and were proven byte-identical `{ base, manifest }` against Silk during
development by a differential-parity harness that has since been removed;
the engine is now covered by its own descriptor-table, freeze, and
strategy unit tests.

## Alternatives rejected

- **Keep hand-listed fields across an authoring interface, schema map, and
  registry, with process discipline to keep them in sync.** Rejected
  implicitly by moving to a single derived source: hand-listing at
  121-field scale cannot be kept honest by convention alone, only by a
  structural derivation plus a compile-time guard.
- **A hand-authored `: FieldDescriptors` type annotation on the merged
  table.** Rejected in favor of `satisfies`, because an explicit annotation
  would widen every entry to the annotation's type and erase the narrow
  per-field schema type the drift guard depends on.
- **Building a new merge engine for the expanded field set.** Rejected: the
  existing strategy set (see `STRATEGY_TABLE`, asserted against by every
  descriptor in `package/__test__/descriptors/table.test.ts:13-15`) covers
  the new fields, so no new merge engines were built.[^table-test]

## Consequences

- Adding or auditing a managed field is a single descriptor entry; the
  schema, registry, and table-driven test coverage all follow from
  it.[^descriptors-index]
- Widening or dropping an authored `PluginConfig` field now breaks
  `pnpm typecheck` instead of surfacing silently at runtime, except for the
  three key-checked-only fields whose authoring shape the schema cannot
  model.[^drift-guard]
- The differential-parity harness that proved the 14-field migration
  behavior-preserving has been removed; there is no equivalent
  byte-identical-against-Silk safety net for future changes to those
  fields, only the descriptor-table, freeze, and strategy unit tests.

[^descriptors-index]: descriptors-index
[^descriptors-types]: descriptors-types
[^registry]: registry
[^drift-guard]: drift-guard
[^table-test]: table-test
