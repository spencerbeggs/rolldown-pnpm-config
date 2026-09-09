---
type: Convention
title: Never set private to false in the source package.json
description: package/package.json must stay "private" true; @savvy-web/bundler's built-in package.json transform flips it only in the built output.
stale_after: 2026-12-08T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: root-claude-md
    resource: CLAUDE.md
  - id: package-json
    resource: package/package.json
  - id: savvy-build
    resource: package/savvy.build.ts
---

# Never set private to false in the source package.json

Never manually set `"private": false` in the source `package/package.json`.
Leave it `"private": true` — this is intentional and correct, not an
oversight to fix.[^root-claude-md] The field is currently `true` in the
committed source.[^package-json]

## Why

`package/savvy.build.ts` drives the build by calling `build()` from
`@savvy-web/bundler` with no `transform()` callback: its entire contents are
`import { build } from "@savvy-web/bundler"` followed by `await build({
dtsExternals: ["rolldown"] })`.[^savvy-build] The `package.json` transform —
setting `"private": false` based on `publishConfig.access`, rewriting
`exports` to point at compiled output, and stripping `devDependencies`,
`scripts`, `publishConfig`, and `devEngines` — is a built-in default of
`@savvy-web/bundler` itself, not a callback this repo supplies.[^root-claude-md]
That transform only ever touches the emitted `dist/dev/` and `dist/prod/`
output, never the source `package.json`.

## What breaks if you "fix" it

Flipping `private` to `false` by hand in the source `package.json` makes the
*source* tree itself publishable — `npm publish` (or an accidental CI step)
run from the workspace root would attempt to publish the unbuilt source,
with dev-only `exports`, `devDependencies`, and `scripts` still attached,
instead of the transformed `dist/prod/npm/` output `@savvy-web/bundler`
produces for the npm registry target declared in
`publishConfig.targets`.[^root-claude-md][^package-json]

[^root-claude-md]: root-claude-md
[^package-json]: package-json
[^savvy-build]: savvy-build
