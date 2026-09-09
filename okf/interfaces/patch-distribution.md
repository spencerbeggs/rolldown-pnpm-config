---
type: Interface
title: patch distribution
description: The authoring convention a plugin uses to distribute pnpm dependency patches through its config-dependency package.
kind: config
resource: ../../package/src/patches
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: discover-ts
    resource: ../../package/src/patches/discover.ts
  - id: paths-ts
    resource: ../../package/src/patches/paths.ts
  - id: define-plugin-ts
    resource: ../../package/src/define-plugin.ts
  - id: maps-ts
    resource: ../../package/src/runtime/strategies/maps.ts
---

# patch distribution

## Two folders, two lifetimes

`discoverPatches` (`package/src/patches/discover.ts:30-60`) walks two
folders adjacent to a plugin's build file:

- `public/patches/` — **distributed**. The bundler ships `public/` into
  the published package, so each file resolves in a consumer at
  `node_modules/.pnpm-config/<name>/<rel>` (`distributedPatchPath`,
  `package/src/patches/paths.ts:11-14`) and is entered into
  `base.patchedDependencies` at build time.[^discover-ts][^paths-ts]
- `patches/` (pnpm's default `patchesDir`) — **local-only**. Collected
  with `distributed: false` and never given a `distributedPath`
  (`discover.ts:36-58`).[^discover-ts]

## Ownership

Ownership is per-plugin, scoped by the plugin's own `name`
(`DiscoverPatchesOptions.name`, `discover.ts:19`): the discovered
distributed path is built as `node_modules/.pnpm-config/<name>/<rel>`,
with `<name>` used verbatim (a scoped name keeps its `/`)
(`paths.ts:4-14`). Two plugins with different `name`s therefore never
resolve to the same distributed path even if they patch the same
dependency.

## Authoring directives

No new top-level `PluginConfig` field is introduced; the existing
`patchedDependencies`/`local.patchedDependencies` surface
(`package/src/define-plugin.ts`) carries three directive forms:

- `patchedDependencies: { strategy: "rewrite" }` — discover
  `public/patches/` and rewrite each discovered file to its distributed
  path. The bare-map form of `patchedDependencies` remains the
  full-manual escape hatch (see `LocalDirective`'s `"rewrite"` strategy
  in [local-directive](local-directive.md)).
- `local.patchedDependencies: { strategy: "merge" }` — on `export`,
  upsert this plugin's owned keys with their local on-disk paths while
  preserving every key the directive does not own (the `"merge"`
  strategy resolves to `union` semantics; see
  [local-directive](local-directive.md)).
- `local.localPatchesDir?: string` — overrides the distributed source
  root (default `public/patches/`, `discover.ts:31-35`). A value that
  points outside `public/` can produce a dangling distributed path (the
  fallback path in `distributedRel`, `paths.ts:16-28`); see
  [../limitations/local-patches-dir-outside-public.md](../limitations/local-patches-dir-outside-public.md).

## Local-vs-distributed reconciliation

At install time, a field whose descriptor uses the `mapChildWins`
strategy (`package/src/runtime/strategies/maps.ts:9`) — which
`patchedDependencies` uses (`package/src/descriptors/build.ts:156`) —
merges a local, consumer-side entry over the distributed one on key
collision, so a consumer's own patch registration takes precedence over
a distributed one for the same key.

[^discover-ts]: discover-ts
[^paths-ts]: paths-ts
