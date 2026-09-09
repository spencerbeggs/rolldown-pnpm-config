---
type: Limitation
title: A non-public localPatchesDir can dangle
description: When local.localPatchesDir points outside public/, the distributed patch path the export pipeline writes will not actually exist in a consumer's install.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: discover-ts
    resource: ../../package/src/patches/discover.ts
  - id: paths-ts
    resource: ../../package/src/patches/paths.ts
  - id: build-ts
    resource: ../../package/src/patches/build.ts
---

# A non-public `localPatchesDir` can dangle

## Condition

`local.localPatchesDir` overrides the distributed source root away from its
default of `public/patches/` (`discoverPatches`,
`package/src/patches/discover.ts:31-35`), and the override value resolves
outside the build config's `public/` directory.[^discover-ts]

## Symptom

`distributedRel` computes a patch's path relative to `public/` and falls
back to `<basename(distRoot)>/<fileName>` whenever `distRoot` is not under
`public/` (`package/src/patches/paths.ts:23-27`).[^paths-ts] That fallback
path is joined with the config-dependency's `name` into
`node_modules/.pnpm-config/<name>/<rel>` by `distributedPatchPath`
(`paths.ts:11-14`), and `withResolvedBuildPatches` writes that path straight
into `patchedDependencies` for `freeze` to bake into the base
(`package/src/patches/build.ts:29-47`).[^build-ts] The bundler that ships
this plugin's config-dependency packages only copies `public/` into the
published artifact — `distributedRel`'s own doc comment states the relative
path it returns is "the subpath the bundler preserves when copying `public/`
into `dist/`" (`paths.ts:17-19`)[^paths-ts] — so a consumer installing the
config dependency never receives a folder outside `public/`: the distributed
path the pnpmfile references dangles at install time, and pnpm's patch step
looks for a file that was never shipped.

## Why it is acceptable

The convention `discoverPatches` documents is two folders adjacent to the
build file: `public/patches/` (distributed, rewritten) and `patches/`
(local-only) (`discover.ts:23-26`).[^discover-ts] `local.localPatchesDir` is
meant to move the distributed root to a different subfolder *of* `public/`,
not to relocate it outside `public/` entirely. A plugin author who keeps
patches under `public/` (the default, or any subdirectory of it) never
observes this: `distributedRel` only takes the basename fallback when the
resolved directory is not a descendant of `public/`.[^paths-ts]

## Fix

A fix would require `discoverPatches`/`distributedRel` to reject (or warn
on) a `localPatchesDir` resolving outside `public/` at build or export time,
rather than silently emitting a path that reads back correctly locally but
was never bundled — turning a currently-silent dangling reference into a
build-time or export-time diagnostic.

This limitation bounds the promise described in
[patch distribution](../interfaces/patch-distribution.md).

[^discover-ts]: discover-ts
[^paths-ts]: paths-ts
[^build-ts]: build-ts
