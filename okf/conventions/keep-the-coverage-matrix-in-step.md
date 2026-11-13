---
type: Convention
title: Keep the managed-fields interface in step with the policy table
description: Update okf/interfaces/managed-pnpm-fields.md whenever the policy table changes; a setting's facts are the @effected/pnpm/settings catalog's.
stale_after: 2026-12-08T00:00:00Z
generated:
  by: claude-code/opus
  at: 2026-11-13T04:57:23Z
sources:
  - id: descriptors-index
    resource: package/src/registry.ts
integrity:
  generated:
    body: b0194a9feb1b5069
---

# Keep the managed-fields interface in step with the policy table

Update [managed-pnpm-fields](../interfaces/managed-pnpm-fields.md) whenever
`FIELD_REGISTRY` in `package/src/registry.ts` changes: an added or removed
field must land in the same change as its row in that
interface.[^descriptors-index] A field's kind in the interface is the
`@effected/pnpm/settings` catalog's, so a kit release that re-kinds a setting
also updates the interface.

## Source precedence

What a setting accepts and where pnpm 12 reads it is the catalog's answer,
which is derived from pnpm 12's own config crate. Do not restate or override a
setting's shape here; a disagreement with `pnpm.io/settings` or the
schemastore schema is a report against `@effected/pnpm`, not a local fix.

See [settings policy table](../modules/settings-policy.md) for the table this
interface enumerates and
[adding-a-managed-field](adding-a-managed-field.md) for the convention that
changes the table in the first place.

[^descriptors-index]: descriptors-index
