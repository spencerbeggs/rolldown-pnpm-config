---
type: Convention
title: Keep the managed-fields interface in step with the descriptor table
description: Update okf/interfaces/managed-pnpm-fields.md whenever the descriptor table changes; treat pnpm.io/settings, not schemastore, as authoritative.
stale_after: 2026-12-08T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: descriptors-index
    resource: package/src/descriptors/index.ts
  - id: resolution-descriptors
    resource: package/src/descriptors/resolution.ts
---

# Keep the managed-fields interface in step with the descriptor table

Update [managed-pnpm-fields](../interfaces/managed-pnpm-fields.md) whenever
`package/src/descriptors/` changes — an added, removed, or re-kinded field
must land in the same change as its entry in that
interface.[^descriptors-index] The interface enumerates the managed field
surface generated from the live descriptor table and must be kept current
with it.

## Source precedence

When a field's documented shape and the JSON schema disagree, treat
`pnpm.io/settings` as authoritative over the schemastore JSON schema
(`schemastore.org/pnpm-workspace.json`), which may lag pnpm releases; do not
resolve a conflict in the schema's favor.

## `confirmModulesPurge` is real but undocumented

`confirmModulesPurge` is a real boolean pnpm setting, declared in
`package/src/descriptors/resolution.ts` and carried over from the Silk
parity set, that has no `pnpm.io` documentation and no schemastore
entry.[^resolution-descriptors] Record it in the interface with no anchor
link rather than inventing one or omitting the field.

See [descriptor table](../modules/descriptors.md) for the table this
interface enumerates and
[adding-a-managed-field](adding-a-managed-field.md) for the convention that
changes the table in the first place.

[^descriptors-index]: descriptors-index
[^resolution-descriptors]: resolution-descriptors
