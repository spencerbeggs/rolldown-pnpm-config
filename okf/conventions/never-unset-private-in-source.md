---
type: Convention
title: Never set private to false in the source package.json
description: package/package.json must stay "private" true; the manifest transform in `effected package build` flips it only in the built output.
stale_after: 2026-12-08T00:00:00Z
status: stable
generated:
  by: okfit/claude-code
  at: 2026-11-08T20:36:01Z
sources:
  - id: root-claude-md
    resource: ../../CLAUDE.md
  - id: package-json
    resource: ../../package/package.json
  - id: effected-toml
    resource: ../../package/effected.toml
  - id: manifest-transform
    resource: npm:@effected/bundler/manifest/transform.js
integrity:
  generated:
    body: f41c79a13aae7b4b
---

# Never set private to false in the source package.json

Never manually set `"private": false` in the source `package/package.json`.
Leave it `"private": true` — this is intentional and correct, not an
oversight to fix.[^root-claude-md] The field is currently `true` in the
committed source.[^package-json]

## Why

`package/package.json`'s `build` script is `effected package build`, configured
only by `package/effected.toml`, whose `[package.build]` table sets
`dtsExternals = ["rolldown"]` and nothing else; this repo supplies no
`transform()` callback.[^package-json][^effected-toml] The `package.json`
transform — setting `"private"` from `publishConfig.access` (`false` when
access is `public`), rewriting `exports` to point at compiled output, and
stripping `devDependencies`, `scripts`, `publishConfig`, `devEngines` and
`packageManager` — is the default manifest transform of the bundler behind
that command.[^manifest-transform] That transform only ever touches the
emitted `dist/prod/npm/pkg/package.json`, never the source `package.json`.

## What breaks if you "fix" it

Flipping `private` to `false` by hand in the source `package.json` makes the
*source* tree itself publishable — `npm publish` (or an accidental CI step)
run from the workspace root would attempt to publish the unbuilt source,
with dev-only `exports`, `devDependencies`, and `scripts` still attached,
instead of the transformed `dist/prod/npm/` output `effected package build`
produces for the npm registry target declared in
`publishConfig.targets`.[^root-claude-md][^package-json]

[^root-claude-md]: root-claude-md
[^package-json]: package-json
[^effected-toml]: effected-toml
[^manifest-transform]: manifest-transform
