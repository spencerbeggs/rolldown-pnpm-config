---
type: DataModel
title: Field policy entry
description: The maintainer-side shape of one FIELD_REGISTRY entry (strategy and enforcement over a pnpm 12 catalog setting), what freeze and export derive from it, and the compile-time guard that keeps the hand-authored PluginConfig interface honest against the catalog.
resource: ../../package/src/registry.ts
status: draft
generated:
  by: claude-code/opus
  at: 2026-11-13T04:57:23Z
sources:
  - id: registry-ts
    resource: ../../package/src/registry.ts
  - id: freeze-ts
    resource: ../../package/src/plugin/freeze.ts
  - id: drift-guard-test
    resource: ../../package/__test__/types/plugin-config.test-d.ts
  - id: registry-test
    resource: ../../package/__test__/plugin/registry.test.ts
integrity:
  generated:
    body: 373224a6b7322212
---

# Field policy entry

## Shape

One entry per managed setting, keyed by the setting's camelCase name, with
two fields (`FieldPolicy` in `package/src/registry.ts`):[^registry-ts]

| field | meaning |
| --- | --- |
| `strategy` | the runtime merge strategy that combines the managed value with a consumer's local one |
| `enforcement` | the default enforcement (`absent`, `warn`, `error`) when the config does not wrap the field with its own |

The key must name a setting in `@effected/pnpm/settings`'s
`PnpmSettingsCatalog.entries`; the `satisfies` clause makes any other key a
compile error. Schema, kind, locations and documentation are read from the
catalog entry and never restated here.

## What is derived

- `freeze` validates each declared field through the catalog schema with
  `onExcessProperty: "error"`, encodes the result back to plain JSON, and
  records `{ strategy, enforcement, options? }` in the manifest.[^freeze-ts]
- `WORKSPACE_FIELDS` is the entries whose catalog `locations` include
  `workspace`.[^registry-ts]

## What keeps it honest

- `package/__test__/types/plugin-config.test-d.ts` asserts every authored
  `PluginConfig` field is mutually assignable with
  `FieldInput<PnpmSettingType<K>>` for its key. `catalogs`,
  `publicHoistPattern`, `peerDependencyRules` and `patchedDependencies` are
  key-checked only, since each carries authoring-side behaviour the catalog
  does not model.[^drift-guard-test]
- `package/__test__/plugin/registry.test.ts` checks each entry names a known
  strategy and a catalog setting, and that no setting pnpm 12 does not read
  is offered.[^registry-test]

[^registry-ts]: registry-ts
[^freeze-ts]: freeze-ts
[^drift-guard-test]: drift-guard-test
[^registry-test]: registry-test
