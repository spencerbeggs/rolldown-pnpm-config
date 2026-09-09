---
type: Module
title: Patches
description: Build/CLI-side patch discovery and path rewrite so a plugin author can distribute pnpm dependency patches.
resource: ../../package/src/patches
kind: package
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: discover
    resource: package/src/patches/discover.ts
  - id: build
    resource: package/src/patches/build.ts
  - id: paths
    resource: package/src/patches/paths.ts
  - id: reconcile
    resource: package/src/patches/reconcile.ts
---

# Patches

## Boundary

`package/src/patches/` (`keys.ts`, `paths.ts`, `discover.ts`, `build.ts`,
`reconcile.ts`) discovers `.patch` files in two convention folders adjacent
to a plugin author's build file — `public/patches/` (distributed) and
`patches/` (local-only) — via `discoverPatches`
(`package/src/patches/discover.ts:25,30`),[^discover] reverses pnpm's
`/`→`__` filename mangling to derive the `patchedDependencies` key, and
rewrites distributed paths to `node_modules/.pnpm-config/<name>/<rel>`
(`distributedRel`, `package/src/patches/paths.ts:23`).[^paths] It is shared
by the build plugin and the `export` CLI command so both emit agreeing
paths. It is **never imported by `runtime/**`** — this is the one place the
Effect-at-build-time boundary is stated as a hard constraint on this module
specifically: `freeze` still receives plain data.

## What crosses the boundary

At build time, the plugin freezes `withResolvedBuildPatches(config,
baseDir)` (`package/src/patches/build.ts:29`),[^build] so the emitted
pnpmfile's `base.patchedDependencies` carries the rewritten distributed
map. At export time, `export` pre-resolves the config before `freeze`, then
overrides `effective.patchedDependencies` with the local on-disk paths
merged by key over the existing `pnpm-workspace.yaml`, preserving sibling
plugins' and the repo's own entries — the distributed `.pnpm-config` path
never leaks into the local file. `export` also prints a reconcile report
(`reconcilePatches`, `PatchReconcileReport`, `package/src/patches/reconcile.ts:5,17`)[^reconcile]
as stale-entry and key-mismatch warnings.

## What lives inside

The descriptor table is unchanged by this module: `patchedDependencies`,
`patchesDir` and `configDependencies` stay as plain descriptors, and
`patchesDir` is never read by this code — see
[descriptors](descriptors.md). Ownership of a patch is scoped by plugin
`name`, so multiple config-deps and a repo's own `patches/` coexist without
engine-level collision detection; a naming collision is the user's to
inspect via `preview`.

[^discover]: discover
[^build]: build
[^paths]: paths
[^reconcile]: reconcile
