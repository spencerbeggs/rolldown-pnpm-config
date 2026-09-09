---
type: Module
title: CLI
description: The developer-facing rolldown-pnpm-config binary — upgrade, export and preview commands plus the shared diff/render layer.
resource: ../../package/src/cli
kind: package
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: bin
    resource: package/src/cli/bin.ts
  - id: styled
    resource: package/src/cli/ui/styled.ts
  - id: ansi
    resource: package/src/cli/ui/ansi.ts
  - id: env
    resource: package/src/cli/ui/env.ts
  - id: diff-build
    resource: package/src/cli/diff/build.ts
  - id: local-merge
    resource: package/src/cli/local-merge.ts
  - id: effective
    resource: package/src/cli/effective.ts
---

# CLI

## Boundary

`package/src/cli/` is published via the `bin` entry `rolldown-pnpm-config`
and holds three subcommands registered in `package/src/cli/bin.ts:10` —
`upgrade`, `export` and `preview` (`commands/upgrade.ts`,
`commands/export.ts`, `commands/preview.ts`).[^bin] It is a developer-facing
subsystem separate from the build-to-runtime engine (see
[plugin-engine](plugin-engine.md)); the CLI and the engine share only the
authoring shape (`PnpmConfigPlugin`'s inline `catalogs`) that `upgrade`
statically reads and rewrites. Discovery and rewrite are 100% static,
through `oxc-parser` byte spans — the config source is never executed. The
CLI is the sole writer for a plugin author's config file and for
workspace-sourced catalog entries; the build path never writes (see
[plugin-engine](plugin-engine.md)).

## What crosses the boundary

`upgrade [file]` discovers catalog version literals in a
`PnpmConfigPlugin(...)` call, resolves candidate versions (registry or, for
`source: "workspace"` entries, the local workspace's next release
versions), lets the author choose interactively or applies latest-in-range
non-interactively, and rewrites the accepted edits' byte spans in place. It
also owns all peer-range recomputation (`lock`, `lock-minor`, `interop`
strategies) — the runtime engine never derives a peer range.

`export [path]` runs `evaluatePluginConfig` → `freeze` → filters to
`WORKSPACE_FIELDS` → applies `excludeByRepo` and per-field `local`
directives (`effectiveManaged`, `vanillaManaged`,
`package/src/cli/effective.ts:21,46`)[^effective] → overlays onto the
parsed `pnpm-workspace.yaml` → writes (or, under `--dry-run`, prints a
colored diff and writes nothing). `preview [path]` is a read-only `ink-tab`
explorer over three views (Changes, Full, Simulated) built from the same
pipeline.

## What lives inside

`ui/` and `diff/` are the shared render layer all three commands import.
`ui/styled.ts` defines the `StyledLine` contract (`gutter`, `indent`,
`segments`, an optional `tag: "local" | "unmanaged"`,
`package/src/cli/ui/styled.ts:15,18,24`);[^styled] `ui/ansi.ts` maps
`StyledLine[]` to ANSI text (`toAnsi`, `package/src/cli/ui/ansi.ts:11`);[^ansi]
`ui/env.ts` is the only module reading `std-env`/`std-osc8`
(`package/src/cli/ui/env.ts:1-2,20`) for capability detection (`color`,
`interactive`, `hyperlinks`) — render functions themselves never read the
environment.[^env] `ui/legend.ts` renders the matching color legend.
`diff/` (`types.ts`, `build.ts`, `render.ts`) is the structured diff tree
(`DiffNode`, `DiffMeta`) over canonicalized before/after data
(`package/src/cli/diff/types.ts:5,18`, `package/src/cli/diff/build.ts`).[^diff-build]
`local-merge.ts` (`isLocalDirective`, `applyLocalDirective`,
`package/src/cli/local-merge.ts:13,48`) and `effective.ts` implement the
export-time-only `local` directive semantics (`preserve`, `union`,
`difference`, `merge`, `rewrite`) — this layer never touches the bundled
runtime or `base`.[^local-merge] The interactive `upgrade` table
(`walk-reducer.ts`, `ui/Walk.ts`), the live interop reconcile
(`interop-live.ts`), and the release-age gate readers (`release-age.ts`)
are internal to the `upgrade` pipeline; `resolve.ts`/`workspace-resolve.ts`
are the two `RegistryResolver` implementations behind one
`Context.Service` seam.

See [static-config-discovery](../decisions/static-config-discovery.md) and
[shared-styled-line-render-layer](../decisions/shared-styled-line-render-layer.md).

[^bin]: bin
[^styled]: styled
[^ansi]: ansi
[^env]: env
[^diff-build]: diff-build
[^local-merge]: local-merge
[^effective]: effective
