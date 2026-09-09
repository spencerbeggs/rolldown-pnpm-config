---
type: Module
title: Descriptor table
description: The declarative table of 121 managed pnpm fields, the single source of truth the schemas and strategy registry derive from.
resource: ../../package/src/descriptors
kind: package
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: descriptors-index
    resource: package/src/descriptors/index.ts
  - id: registry
    resource: package/src/registry.ts
  - id: descriptors-types
    resource: package/src/descriptors/types.ts
---

# Descriptor table

## Boundary

Each managed pnpm field is one entry in this declarative table: `schema`,
`kind`, merge `strategy`, default `enforcement`, doc string and an optional
refine `options` (`package/src/descriptors/types.ts`, `FieldDescriptor<A>`).
The table is split across category modules — `resolution.ts`, `hoisting.ts`,
`lockfile.ts`, `build.ts`, `runtime-cfg.ts`, `workspace.ts`, `misc.ts`,
`network.ts` — merged with `satisfies FieldDescriptors` (never a
`: FieldDescriptors` annotation) into one `DESCRIPTORS` object
(`package/src/descriptors/index.ts:17,26`).[^descriptors-index] The
`satisfies` form is load-bearing: it preserves each entry's narrow schema
type so downstream drift checks can read per-field value types.

## What crosses the boundary

Nothing downstream hand-lists fields; everything is **derived** from
`DESCRIPTORS`:

- `deriveSchemas(DESCRIPTORS)` (`package/src/descriptors/index.ts:29`)
  produces `FIELD_SCHEMAS`, consumed by `freeze` (see
  [plugin-engine](plugin-engine.md)).[^descriptors-index]
- `deriveRegistry(DESCRIPTORS)` (`package/src/descriptors/index.ts:36`,
  re-exported at `package/src/registry.ts:4` as `FIELD_REGISTRY`) is
  consumed by the runtime's strategy table (see
  [runtime](runtime.md)).[^registry]

Adding a field is a single descriptor entry plus its matching `PluginConfig`
line — the schema, registry and table-driven tests all follow from it.
`package/src/descriptors/schemas.ts` holds the schema-derivation logic
itself.

## What lives inside

The strategies a descriptor's `strategy` name refers to are owned by
`runtime/strategies/`, not this table — the descriptor table reuses the
existing strategies and adds no new merge engine for the expanded field
set. `catalogs` and `peerDependencyRules` are special-cased outside this
table entirely: both are resolved at `freeze` time rather than validated as
plain descriptor-driven fields (see [plugin-engine](plugin-engine.md)).

See [effect-at-build-time-only](../decisions/effect-at-build-time-only.md)
and [descriptor-table-as-source-of-truth](../decisions/descriptor-table-as-source-of-truth.md)
for why this table is shaped the way it is.

[^descriptors-index]: descriptors-index
[^registry]: registry
