---
type: Runbook
title: Build the dual outputs
description: Produce the dev and prod build outputs from `package/src/` via Turbo and `@savvy-web/bundler`.
resource: ../../package/savvy.build.ts
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: savvy-build
    resource: ../../package/savvy.build.ts
  - id: turbo-json
    resource: ../../turbo.json
  - id: root-package-json
    resource: ../../package.json
  - id: package-package-json
    resource: ../../package/package.json
  - id: dev-pkg-manifest
    resource: ../../package/dist/dev/pkg/package.json
tags:
  - release
  - architecture
---

# Build the dual outputs

## Trigger

Any change under `package/src/` (or the files Turbo's `build:dev`/`build:prod`
tasks list as inputs — `package.json`, `tsconfig.json`, `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, `README.md`, `LICENSE`, `public/**`, `lib/**`).[^turbo-json]

## Procedure

1. Turbo runs `types:check` first — it depends on nothing but `^build:dev`
   of upstream workspace packages, and both `build:dev` and `build:prod`
   ultimately require it.[^turbo-json]
2. `build:dev` runs `node savvy.build.ts --target dev`, producing
   `dist/dev/` — this output is also what `package/package.json`'s
   `publishConfig.directory` points at (`dist/dev/pkg`), and what
   `prepare`'s `turbo run build:dev` produces for local consumption after
   install.[^package-package-json]
3. `build:prod` depends on both `types:check` and `build:dev`
   (`dependsOn: ["types:check", "build:dev"]`) and runs
   `node savvy.build.ts --target prod`, producing `dist/prod/`.[^turbo-json]
4. At the root, `pnpm run build` orchestrates both via
   `turbo run build:dev build:prod`.[^root-package-json]

## What `@savvy-web/bundler`'s output transform does

Both targets emit a `package.json` alongside the compiled output (`dist/dev/pkg/package.json`,
`dist/prod/npm/pkg/package.json`) that differs from the source
`package/package.json`:

- `private` is set to `false` (the source manifest stays `"private": true`;
  see the never-unset-private convention).
- `exports` is rewritten to point at the compiled `.js`/`.d.ts` files
  instead of `src/`.
- `devDependencies`, `scripts`, and `publishConfig` are stripped from the
  emitted manifest.[^dev-pkg-manifest]

This is a built-in behavior of `@savvy-web/bundler` — the current
`savvy.build.ts` calls `build({ dtsExternals: ["rolldown"] })` with no
explicit `transform()` callback, and the emitted manifests already show
the stripped/rewritten shape described above.[^savvy-build][^dev-pkg-manifest]

## Success

Both `package/dist/dev/` and `package/dist/prod/` are present, and each
carries a `package.json` with `"private": false` and a rewritten `exports`
map (`package/dist/dev/pkg/package.json`,
`package/dist/prod/npm/pkg/package.json`).[^dev-pkg-manifest]

[^turbo-json]: turbo-json
[^package-package-json]: package-package-json
[^root-package-json]: root-package-json
[^savvy-build]: savvy-build
[^dev-pkg-manifest]: dev-pkg-manifest
