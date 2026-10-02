---
type: Module
title: CLI
description: The developer-facing rolldown-pnpm-config binary — upgrade, export and preview commands plus the shared diff/render layer.
resource: ../../package/src/cli
kind: package
generated:
  by: okfit/claude-code
  at: 2026-10-02T15:35:24Z
  body_sha256: b6d71724b6be1b63e9e4bbbb52f7396fb6abcf06ecaac5870a1f6c3569a6ca46
sources:
  - id: bin
    resource: package/src/cli/bin.ts
  - id: main
    resource: package/src/cli/main.ts
  - id: tone
    resource: package/src/cli/render/tone.ts
  - id: screens
    resource: package/src/cli/ui/screens.ts
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
and holds three subcommands registered on the root command in `root.ts` —
`upgrade`, `export` and `preview` (`commands/upgrade.ts`,
`commands/export.ts`, `commands/preview.ts`).[^bin] `bin.ts` only calls
`main()`; `main.ts` runs the tree through `@effected/cli`'s
`CliRuntime.main`, which decides the audience, colour and interactivity,
reports failures, and maps exit codes (see [CLI
output](../interfaces/cli-output.md)).[^main] It is a developer-facing
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
colored diff and writes nothing). `preview [path]` is a read-only tabbed
explorer over three views (Changes, Full, Simulated) built from the same
pipeline.

## What lives inside

`render/`, `diff/` and `ui/` are the presentation layer. `render/tone.ts`
maps a `Tone` (added, removed, unmanaged, merge, …) to a theme token and
builds diff-shaped rows of `@effected/cli` `Doc` inlines; the producers —
`diff/render.ts` (`renderExportDiff`), `simulated-view.ts`, `summary.ts`
and `render/legend.ts` — emit `Doc` blocks directly, and the renderer the
audience picks decides whether they become colour.[^tone] `diff/` also holds
the structured diff tree (`DiffNode`, `DiffMeta`) over canonicalized
before/after data.[^diff-build] `ui/` holds the kit screens — the upgrade
table (`walk-screen.tsx`, over the pure reducer in `walk-reducer.ts`), the
preview explorer (`preview-screen.tsx`) and the resolve progress live view
(`progress-view.tsx`) — loaded only on mount through `ui/screens.ts`, the
one module commands import, so a non-interactive run never loads
React.[^screens] No module under `cli/` reads `process` except `bin.ts`,
`main.ts` and `version.ts`; the working directory reaches commands as the
`WorkingDirectory` service (`cwd.ts`).
`local-merge.ts` (`isLocalDirective`, `applyLocalDirective`,
`package/src/cli/local-merge.ts:13,48`) and `effective.ts` implement the
export-time-only `local` directive semantics (`preserve`, `union`,
`difference`, `merge`, `rewrite`) — this layer never touches the bundled
runtime or `base`.[^local-merge] The interactive `upgrade` table
(`walk-reducer.ts`, `ui/walk-screen.tsx`), the live interop reconcile
(`interop-live.ts`), and the release-age gate readers (`release-age.ts`)
are internal to the `upgrade` pipeline; `resolve.ts`/`workspace-resolve.ts`
are the two `RegistryResolver` implementations behind one
`Context.Service` seam.

See [static-config-discovery](../decisions/static-config-discovery.md) and
[cli-presentation-on-effected-cli](../decisions/cli-presentation-on-effected-cli.md).

[^bin]: bin
[^main]: main
[^tone]: tone
[^screens]: screens
[^diff-build]: diff-build
[^local-merge]: local-merge
[^effective]: effective
