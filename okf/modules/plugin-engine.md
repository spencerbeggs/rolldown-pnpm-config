---
type: Module
title: Plugin engine
description: The build-time engine — PnpmConfigPlugin, the memoized freeze step, and virtual-module serialization.
resource: ../../package/src/plugin
kind: package
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: plugin-index
    resource: package/src/plugin/index.ts
  - id: freeze
    resource: package/src/plugin/freeze.ts
  - id: serialize
    resource: package/src/plugin/serialize.ts
---

# Plugin engine

## Boundary

`PnpmConfigPlugin(config)` (`package/src/plugin/index.ts`) is constructed
with the inline `PluginConfig` object and serves two virtual modules to the
bundler: the pnpmfile and a standalone catalogs module. It is a standard
tsdown/rolldown plugin with no hard dependency on `@savvy-web/bundler`. This
is the only place Effect runs (`freeze`, `@internal`,
`package/src/plugin/freeze.ts:56`); the runtime it serializes into is
zero-dependency (see [runtime](runtime.md)). The Effect freeze runs once and
is memoized on the plugin closure, because the bundler invokes the plugin
across several passes and the validate-freeze-manifest work must not repeat
(`package/src/plugin/index.ts:31`).[^plugin-index]

## What crosses the boundary

`freeze` validates `config.name` (non-empty, else a `ConfigError`,
`package/src/plugin/freeze.ts:14,70`) and each declared field against its
descriptor-derived schema, and emits three plain-data values: `base` (field
to frozen value), `manifest` (field to `{ strategy, enforcement, options?
}`) and `name` (the validated string, `package/src/plugin/freeze.ts:58`).[^freeze]
`catalogs` is special-cased — `freeze` runs `normalizeCatalogs` (imported at
`package/src/plugin/freeze.ts:2` from `package/src/catalogs.ts`) to resolve
inline catalog declarations, including materialized `<name>:peers`
catalogs, before validating (`package/src/plugin/freeze.ts:64`).[^freeze]
`peerDependencyRules` is likewise special-cased:
`resolvePeerDependencyRules` (`package/src/plugin/allowed-versions.ts`,
imported at `package/src/plugin/freeze.ts:7`, called at
`package/src/plugin/freeze.ts:86`) resolves an optional
`allowedVersionsFromCatalogs` directive against the declared catalogs into
concrete `allowedVersions` rules and strips the directive before
validating, baking the result into `base`.[^freeze]

`serialize.ts` turns `{ base, manifest, name }` into the two virtual
modules: the pnpmfile is `import { createHooks }` plus deterministically
key-sorted `base`/`manifest` literals and the `name` string literal as the
third argument (`package/src/plugin/serialize.ts:30,36-40`); the catalogs
module is a standalone sorted `Map` literal (`package/src/plugin/serialize.ts:18`).
Its recursive `sortKeys` (`package/src/plugin/serialize.ts:2`) keeps
emitted artifacts diff-stable.[^serialize] The `{ base, manifest, name }`
contract is the only thing crossing from this module into the bundled
runtime.

## What lives inside

Field schemas (`FIELD_SCHEMAS`) are derived from the descriptor table (see
[descriptors](descriptors.md)), not owned here. `ConfigError` and the
`freeze` validation logic are `@internal`; the build step **never writes**
to a consumer's files — that responsibility belongs solely to the `upgrade`
CLI (see [cli](cli.md)).

See [effect-at-build-time-only](../decisions/effect-at-build-time-only.md)
and [standard-rolldown-plugin](../decisions/standard-rolldown-plugin.md).

[^plugin-index]: plugin-index
[^freeze]: freeze
[^serialize]: serialize
