---
type: Decision
title: Workspace consumers link the package's TypeScript source through tsx
description: "The examples/* workspaces resolve rolldown-pnpm-config to package/src/*.ts, loaded by tsx via pnpm's nodeOptions, instead of to a dev build output."
status: stable
generated:
  by: okfit/claude-code
  at: 2026-11-08T21:16:18Z
sources:
  - id: package-package-json
    resource: ../../package/package.json
  - id: pnpm-workspace
    resource: ../../pnpm-workspace.yaml
  - id: root-package-json
    resource: ../../package.json
  - id: cli-bin
    resource: ../../package/src/cli/bin.ts
  - id: build-command
    resource: npm:@effected/cli/commands/package/build.js
  - id: vitest-setup
    resource: ../../vitest.setup.ts
tags:
  - architecture
  - dx
integrity:
  generated:
    body: b7aa2627b6697939
  verified:
    by: human:spencer
    at: 2026-11-08T21:37:34Z
    content: 29ba262018a05804
verified:
  - by: human:spencer
    at: 2026-11-08T21:37:34Z
---

# Workspace consumers link the package's TypeScript source through tsx

## Context

The three example workspaces (`examples/rolldown`, `examples/savvy`,
`examples/tsdown`) depend on `rolldown-pnpm-config` as `workspace:*` and run
both its build plugin and its CLI. The package builds with
`effected package build`, which emits only `dist/prod/` and has no dev
target.[^build-command] Previously `publishConfig.directory: dist/dev/pkg`
with `linkDirectory: true` pointed workspace links at a dev build that a
`prepare` script produced after install; with no dev build left, that link
target no longer exists.

## Decision

Workspace links resolve to the package directory itself, and its source
`exports` and `bin` point at `src/*.ts`; `publishConfig` carries no
`directory` or `linkDirectory`.[^package-package-json] To make Node load that
TypeScript, `pnpm-workspace.yaml` sets `nodeOptions: --import=tsx`, so every
pnpm-run script registers tsx, and the root declares `tsx` as a
devDependency.[^pnpm-workspace][^root-package-json]

Two edges need their own handling:

- A direct run of the linked `.bin/rolldown-pnpm-config` outside a pnpm
  script does not get `nodeOptions`, so `package/src/cli/bin.ts` registers
  tsx itself when it is running from a `.ts` file. The built `.js` bin never
  takes that branch, and the `tsx/esm/api` specifier is assembled at run time
  so rolldown cannot inline it into the published package.[^cli-bin]
- The CLI's `.tsx` screens under `package/src/cli/ui/` open with a
  `/** @jsxRuntime automatic */` pragma, which pins the JSX runtime in the
  file rather than depending on which tsconfig tsx reads when the source is
  loaded from a consumer workspace.

The package's own e2e suite still runs the built prod bin
(`dist/prod/npm/pkg/bin/rolldown-pnpm-config.js`), so the published artifact
is what the tests exercise; the test global setup builds it with
`pnpm turbo run build build:dev`.[^vitest-setup]

## Alternatives rejected

- **Keep a dev build as the link target.** `effected package build` has no
  dev target, and a dev build also needed a `prepare` build after every
  install and went stale between source edits and rebuilds.
- **Link the prod build.** Pointing `publishConfig.directory` at
  `dist/prod/npm/pkg` would make every example depend on a fresh prod build
  before it could run anything, and on a rebuild after every source change.

## Consequences

- Examples see source edits without a rebuild.
- `tsx` is a root-only devDependency and a hard requirement for running the
  examples' scripts; removing `nodeOptions` from `pnpm-workspace.yaml` breaks
  every workspace link.
- The examples' own `build:dev`/`build:prod` tasks do not depend on `^build`,
  because they load the package's source, not its build. They list
  `package/src/**` and `package/package.json` as Turbo inputs, so a source
  edit still invalidates their cache. A `^build` edge was tried first and
  broke `pnpm install`: the three example `prepare` hooks run in parallel,
  and each built the package into the same `dist/prod`.

[^build-command]: `npm:@effected/cli/commands/package/build.js`
[^package-package-json]: `package/package.json`
[^pnpm-workspace]: `pnpm-workspace.yaml`
[^root-package-json]: `package.json`
[^cli-bin]: `package/src/cli/bin.ts`
[^vitest-setup]: `vitest.setup.ts`
