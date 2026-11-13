---
type: Convention
title: Add a managed field through the policy table only
description: A new managed pnpm field is one FIELD_REGISTRY entry naming a pnpm 12 catalog setting plus its matching PluginConfig line; its schema comes from @effected/pnpm/settings, never from here.
status: draft
stale_after: 2027-02-10T00:00:00Z
generated:
  by: claude-code/opus
  at: 2026-11-13T04:57:23Z
sources:
  - id: registry
    resource: package/src/registry.ts
  - id: drift-guard
    resource: package/__test__/types/plugin-config.test-d.ts
  - id: registry-test
    resource: package/__test__/plugin/registry.test.ts
integrity:
  generated:
    body: 23a3be6e1952318f
---

# Add a managed field through the policy table only

Add a managed pnpm field by writing one entry in `FIELD_REGISTRY`
(`package/src/registry.ts`) with its `strategy` and `enforcement`, plus its
matching `PluginConfig` line typed `FieldInput<PnpmSettingType<"name">>`.[^registry]
Never write a schema for a pnpm setting in this repository: the schema, kind
and locations are the `@effected/pnpm/settings` catalog entry's. A setting the
catalog does not carry is not a pnpm 12 setting; the table's `satisfies`
clause refuses it.

## What must stay green

- The compile-time drift guard at
  `package/__test__/types/plugin-config.test-d.ts`, which asserts each
  authored `PluginConfig` field and the catalog's type are mutually
  assignable.[^drift-guard]
- `package/__test__/plugin/registry.test.ts`, which checks each entry's
  strategy exists and its key is a catalog setting.[^registry-test]

See [settings policy table](../modules/settings-policy.md) and
[keep-the-coverage-matrix-in-step](keep-the-coverage-matrix-in-step.md) for
the companion documentation update this same change requires.

[^registry]: registry
[^drift-guard]: drift-guard
[^registry-test]: registry-test
