---
type: Interface
title: PnpmConfigPlugin authoring surface
description: The single canonical, statically analyzable PnpmConfigPlugin({...}) call a plugin author writes against.
resource: ../../package/src/define-plugin.ts
kind: api
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: define-plugin
    resource: package/src/define-plugin.ts
  - id: plugin-index
    resource: package/src/plugin/index.ts
  - id: catalogs-ts
    resource: package/src/catalogs.ts
  - id: drift-guard-test
    resource: package/__test__/types/plugin-config.test-d.ts
tags:
  - architecture
---

# PnpmConfigPlugin authoring surface

## What a consumer gets

An author declares catalogs plus the managed pnpm fields in one canonical,
statically analyzable call: `PnpmConfigPlugin(config)`
(`package/src/plugin/index.ts:78`), re-exported from
`package/src/index.ts`.[^plugin-index] Catalogs are inline —
`catalogs: { <name>: { packages: { <pkg>: range | { range, peer?,
strategy?, source? } } } }` — keyed by catalog name
(`package/src/catalogs.ts:29-46`).[^catalogs-ts] The catalog types and a
pure `normalizeCatalogs` live in `package/src/catalogs.ts`; the
`PluginConfig`/`FieldInput` types live in
`package/src/define-plugin.ts`.[^catalogs-ts][^define-plugin]

`PluginConfig` (`package/src/define-plugin.ts:31`) is a hand-authored
interface — one `FieldInput<T>` per field — written by hand rather than
derived, specifically so each field can carry rich per-field JSDoc for
authoring DX.[^define-plugin] `FieldInput<T>` (`define-plugin.ts:10`) is
either a bare `T` or `{ value, enforcement }`, letting an author override
the default enforcement per field.[^define-plugin]

## What stays stable

- Because `PluginConfig` is hand-authored rather than derived, it is kept
  in lockstep with the descriptor table (see
  [descriptor-table](../models/descriptor-table.md)) by the compile-time
  drift guard at `package/__test__/types/plugin-config.test-d.ts`, so an
  author-visible field's shape cannot silently widen, narrow, or drop
  without `typecheck` failing.[^drift-guard-test]
- `name: string` (`package/src/define-plugin.ts:39`) is a required
  top-level field — plugin metadata, never written to
  `pnpm-workspace.yaml` and not a descriptor field; see
  [{ base, manifest, name } contract](base-manifest-name.md).[^define-plugin]

### The three key-checked-only fields

Three fields are checked by the drift guard for key presence only, not
value-level type equivalence, because each carries authoring shape the
descriptor schema does not model (`plugin-config.test-d.ts:8-12`):[^drift-guard-test]

- **`catalogs`** — authored as inline declarations, not through a
  descriptor schema shape at all.
- **`publicHoistPattern`** — additionally accepts
  `{ value, excludeByRepo }` (`package/src/define-plugin.ts:78-84`), and
  the schema does not model the `excludeByRepo` refine.
- **`peerDependencyRules`** — carries the build-time
  `allowedVersionsFromCatalogs` directive (`define-plugin.ts:99-103`) that
  the schema does not model.

Each stays fully covered by the guard's *key* check
(`_AssertKeyCoverage`, `plugin-config.test-d.ts:44-49`) — dropping one from
`PluginConfig` entirely still fails `typecheck` — only the per-value
comparison (`_AssertNoValueDrift`, `plugin-config.test-d.ts:51-66`) is
skipped for these three.[^drift-guard-test]

## What is not part of the promise

- How `PnpmConfigPlugin` turns the declared config into `{ base, manifest,
  name }` — the `freeze` validation step (`package/src/plugin/freeze.ts`)
  — is build-time machinery behind this authoring surface, not part of
  the contract an author writes against.
- An earlier three-entry-point authoring shape is gone; only the one
  consolidated `PnpmConfigPlugin({...})` call is current.

[^define-plugin]: define-plugin
[^plugin-index]: plugin-index
[^catalogs-ts]: catalogs-ts
[^drift-guard-test]: drift-guard-test
