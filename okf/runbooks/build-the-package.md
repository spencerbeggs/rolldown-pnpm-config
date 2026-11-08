---
type: Runbook
title: Build the package
description: "Produce the single prod build of `package/` into `dist/prod/` via Turbo and `effected package build`."
resource: ../../package/effected.toml
status: draft
generated:
  by: okfit/claude-code
  at: 2026-11-08T20:36:01Z
sources:
  - id: effected-toml
    resource: ../../package/effected.toml
  - id: turbo-json
    resource: ../../turbo.json
  - id: root-package-json
    resource: ../../package.json
  - id: package-package-json
    resource: ../../package/package.json
  - id: prod-pkg-manifest
    resource: ../../package/dist/prod/npm/pkg/package.json
  - id: manifest-transform
    resource: npm:@effected/bundler/manifest/transform.js
tags:
  - release
  - architecture
integrity:
  generated:
    body: b53c5135e35f80fd
---

# Build the package

## Trigger

Any change under `package/src/` (or the other files Turbo's `build` task
lists as inputs — `package.json`, `tsconfig.json`, `effected.toml`,
`README.md`, `LICENSE`, `public/**`, `lib/**`, and the root
`pnpm-workspace.yaml`, `pnpm-lock.yaml` and `.changeset/**`).[^turbo-json]

There is one build of `package/` and no dev build. Workspace consumers
(`examples/*`) link the package's TypeScript source, not a build output; see
[workspace source links](/decisions/workspace-source-links.md).

## Procedure

1. Turbo runs `types:check` first. It depends on `^types:check` of upstream
   workspace packages, and the package's `build` task depends on
   it.[^turbo-json]
2. `build` runs the package script `effected package build` (the `effected`
   bin comes from the root devDependency `@effected/plugin`). It reads
   `package/effected.toml`, whose `[package.build]` table sets
   `dtsExternals = ["rolldown"]` so rolldown's types are not inlined into the
   emitted declarations, and writes `dist/prod/`.[^package-package-json][^effected-toml]
3. At the root, `pnpm run build` runs `turbo run build build:dev build:prod`.
   The package answers to `build`; `build:dev` and `build:prod` are the
   example consumers' own tasks, which depend on `^build` so the package is
   built before them.[^root-package-json][^turbo-json]

## What the emitted manifest transform does

The build emits `dist/prod/npm/pkg/package.json`, which differs from the
source `package/package.json`:

- `private` is set from `publishConfig.access` — `false` here, because access
  is `public` (the source manifest stays `"private": true`; see the
  [never-unset-private convention](/conventions/never-unset-private-in-source.md)).
- `exports` and `bin` are rewritten to point at the compiled `.js`/`.d.ts`
  files instead of `src/*.ts`.
- `devDependencies`, `scripts`, `publishConfig`, `devEngines` and
  `packageManager` are stripped.[^manifest-transform][^prod-pkg-manifest]

This is the default manifest transform of the bundler behind
`effected package build`; this repository supplies no `transform()` of its
own.[^manifest-transform]

## Success

`package/dist/prod/` holds `npm/pkg/` (the publishable package, whose
`package.json` carries `"private": false` and a rewritten `exports` map),
plus `targets.json` and `issues.json`.[^prod-pkg-manifest] No
`package/dist/dev/` is produced.

[^turbo-json]: turbo-json
[^package-package-json]: package-package-json
[^root-package-json]: root-package-json
[^effected-toml]: effected-toml
[^prod-pkg-manifest]: prod-pkg-manifest
[^manifest-transform]: manifest-transform
