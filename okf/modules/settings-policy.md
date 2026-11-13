---
type: Module
title: Settings policy table
description: The plugin's merge strategy and enforcement for each of the 108 pnpm settings it manages, laid over the pnpm 12 settings catalog from @effected/pnpm/settings.
resource: ../../package/src/registry.ts
kind: package
status: draft
generated:
  by: claude-code/opus
  at: 2026-11-13T04:57:23Z
sources:
  - id: registry
    resource: package/src/registry.ts
  - id: freeze
    resource: package/src/plugin/freeze.ts
  - id: settings-catalog
    resource: "npm:@effected/pnpm/settings"
integrity:
  generated:
    body: 88fe6a66ac81a1e2
---

# Settings policy table

## Boundary

The facts about a pnpm setting (its schema, its kind, where pnpm 12 reads it,
its documentation) are not this repository's: they come from
`PnpmSettingsCatalog.entries` in `@effected/pnpm/settings`.[^settings-catalog]
What this repository decides is its policy over each setting it manages: a
merge `strategy` (a key of the runtime strategy table) and a default
`enforcement`. That policy is one table, `FIELD_REGISTRY` in
`package/src/registry.ts`, written `as const satisfies
Partial<Record<PnpmSettingName, FieldPolicy>>`, so a key the catalog does not
know fails to compile.[^registry]

## What crosses the boundary

Everything else is derived from the table and the catalog:

- `FIELD_SCHEMAS`: each managed field's catalog schema, which `freeze` decodes
  every value through (excess keys refused), then encodes back to the plain
  value pnpm reads (see [plugin-engine](plugin-engine.md)).[^freeze]
- `WORKSPACE_FIELDS`: the managed fields whose catalog `locations` include
  `workspace`, the set `export` and `preview` write to
  `pnpm-workspace.yaml`.[^registry]
- `ManagedField` / `MANAGED_FIELDS`: the key set, consumed by the runtime
  strategy table through the manifest (see [runtime](runtime.md)).

`freeze` also refuses, by name and with what to use instead, the settings
earlier releases offered that pnpm 12 does not read.[^freeze]

## What lives inside

Only policy. The strategies a policy names are owned by `runtime/strategies/`;
`catalogs`, `overrides` (with `overridesFromCatalogs`) and
`peerDependencyRules` (with `allowedVersionsFromCatalogs`) carry build-time
directives resolved in `freeze` before validation. See
[settings-catalog-from-the-kit](../decisions/settings-catalog-from-the-kit.md)
for why the facts moved to the kit.

[^registry]: registry
[^freeze]: freeze
[^settings-catalog]: settings-catalog
