---
type: Convention
title: Add a managed field through the descriptor table only
description: A new managed pnpm field is one descriptor entry plus its matching PluginConfig line; never hand-list a field anywhere else.
stale_after: 2026-12-08T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: descriptors-index
    resource: package/src/descriptors/index.ts
  - id: drift-guard
    resource: package/__test__/types/plugin-config.test-d.ts
  - id: table-test
    resource: package/__test__/descriptors/table.test.ts
---

# Add a managed field through the descriptor table only

Add a managed pnpm field by writing one entry in the descriptor table under
`package/src/descriptors/` plus its matching `PluginConfig` authoring line —
nothing else.[^descriptors-index] Never hand-list a field directly in the
validation schema map or in the strategy/enforcement registry; both are
**derived** from the table via `deriveSchemas` and `deriveRegistry`
(`package/src/descriptors/index.ts`), not maintained by hand.[^descriptors-index]

## Keep `satisfies`, never annotate

Keep the merge of the category modules into `DESCRIPTORS` written with
`satisfies` in `package/src/descriptors/index.ts`. Never replace it with a
`: FieldDescriptors` type annotation — an explicit annotation widens every
entry to the annotation's type and erases the narrow per-field schema type
the compile-time drift guard depends on.[^descriptors-index] See
[descriptor-table-as-source-of-truth](../decisions/descriptor-table-as-source-of-truth.md)
for why this is a Decision, not just a style preference.

## What must stay green

Every new or changed field must keep both of these passing:

- The compile-time drift guard at
  `package/__test__/types/plugin-config.test-d.ts`, which asserts each
  authored `PluginConfig` field's type and its descriptor-derived type are
  mutually assignable.[^drift-guard] Three keys — `catalogs`,
  `publicHoistPattern`, and `peerDependencyRules` — are key-checked only,
  because each carries authoring-side behavior (a build-time directive or a
  refine) the schema does not model.[^drift-guard]
- The table-driven suite at `package/__test__/descriptors/table.test.ts`,
  which exercises every descriptor's strategy presence and schema
  accept/reject samples.[^table-test]

See [descriptor table](../modules/descriptors.md) for the table's shape and
[keep-the-coverage-matrix-in-step](keep-the-coverage-matrix-in-step.md) for
the companion documentation update this same change requires.

[^descriptors-index]: descriptors-index
[^drift-guard]: drift-guard
[^table-test]: table-test
