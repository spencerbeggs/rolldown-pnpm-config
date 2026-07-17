---
status: current
module: rolldown-pnpm-config
category: architecture
created: 2026-06-29
updated: 2026-07-17
last-synced: 2026-07-17
completeness: 90
related:
  - architecture.md
  - upgrade-cli.md
  - settings-coverage.md
  - specs/2026-06-29-cli-diff-render-design.md
  - specs/2026-06-29-export-local-merge-preview-design.md
  - specs/2026-06-30-patch-distribution-design.md
dependencies:
  - architecture.md
---

# rolldown-pnpm-config - export and preview CLI

The `export` and `preview` subcommands, the shared diff/render layer and the local-merge pipeline that composes `excludeByRepo` and per-field directives into the effective workspace config.

## Table of contents

1. [Overview](#overview)
2. [Current state](#current-state)
3. [Command surface](#command-surface)
4. [Shared render layer](#shared-render-layer)
5. [Export pipeline](#export-pipeline)
6. [Local merge semantics](#local-merge-semantics)
7. [Patch distribution](#patch-distribution)
8. [Preview views](#preview-views)
9. [Rationale](#rationale)
10. [Related documentation](#related-documentation)

## Overview

`rolldown-pnpm-config export` materializes the plugin config into the consuming repo's `pnpm-workspace.yaml`. `rolldown-pnpm-config preview` is an interactive `ink-tab` explorer that shows how the file would change across three views — Changes, Full and Simulated — without writing anything.

Both commands share a diff/render layer (`cli/ui/`, `cli/diff/`) that also feeds the colorized `upgrade` summary. The render layer's contract is the `StyledLine` type: a list of styled lines that can be turned into ANSI-colored terminal output or mapped to Ink `Text` components by a single pure function. Capability detection (color, interactivity, hyperlinks) is centralized in `cli/ui/env.ts` and threaded in as flags; render functions never read the environment.

Reference this document when changing the export pipeline, the local-merge engine, the diff/render layer or the `preview` command.

## Current state

Shipped on `feat/ui-updates`. All implementation described below is in the current state of the branch.

Key design decisions made during this phase:

- `export --preview` was removed; `export --dry-run [--full]` replaces it.
- A new standalone `preview` command provides the interactive tabbed view.
- `local.<field>` can now be a directive object `{ preserve?, value?, strategy? }` rather than a bare value; the old pre-freeze `local-overlay.ts` shallow-replace was removed.
- `file:`, `link:`, `workspace:` and `portal:` overrides are preserved by default on every `export` run, fixing a data-loss bug where managed-field writes silently dropped local protocol-prefixed override entries.
- Array fields in the canonical format are sorted lexicographically so the written file matches what the diff shows.

Since migrated to Effect v4 on `feat/effected`: the `export`/`preview` command layer moved from `@effect/cli` to `effect/unstable/cli` (`Args`→`Argument`, `Options`→`Flag`), and `workspace-file.ts`'s YAML read/write moved from `yaml` to `@effected/yaml` (a drop-in over the parse/stringify surface used here, `Yaml`/`YamlStringifyOptions`). Neither the pipeline, the local-merge semantics, the render layer nor the canonical format changed. See [architecture.md](architecture.md) for the migration's dependency-level rationale.

## Command surface

Three subcommands registered in `package/src/cli/bin.ts`:

`rolldown-pnpm-config export [path]` — runs the effective pipeline (freeze → filter workspace fields → excludeByRepo → local directives → overlay → write). Prints `Exported to <path>` on success.

`rolldown-pnpm-config export [path] --dry-run [--full]` — same pipeline but skips the write; prints a colored canonical diff to stdout and exits. `--full` emits the entire canonical tree rather than changed lines plus context. Writes nothing.

`rolldown-pnpm-config preview [path]` — interactive `ink-tab` explorer (Changes / Full / Simulated). When the terminal is non-interactive (`!detectCapabilities().interactive`), falls back to printing the Changes view via `toAnsi` and exits — never hangs in CI or piped output.

All three reuse `buildDiff` / `renderExportDiff` / `toAnsi`. The file-arg is optional; when omitted, `findWorkspaceFile` locates the nearest `pnpm-workspace.yaml`.

## Shared render layer

Lives in `package/src/cli/ui/` and is imported by the export, preview and upgrade commands.

`cli/ui/styled.ts` defines the `StyledLine` contract: an `indent` depth, a single-character `gutter` symbol (`+` added, `~` changed, `-` removed, ` ` unchanged, `·` local, `░` unmanaged, `⚠` conflict/warn), a list of `Segment`s each with a `ChangeStyle` and a text run, and an optional `DiffTag`. Gutters and tags are always present so output is meaningful with color off.

`cli/ui/ansi.ts` exports `toAnsi(lines, { color }): string` — a pure function that maps `StyledLine[]` to a colored (or plain) terminal string. Never reads the environment.

`cli/ui/env.ts` is the only module that imports `std-env` and `std-osc8`. It exports `detectCapabilities(): { color, interactive, hyperlinks }` and re-exports `link` from `std-osc8` for optional OSC-8 hyperlinks. `interactive` is `hasTTY && !isCI && !isAgent`; `color` is `isColorSupported` from `std-env`.

The diff model in `cli/diff/` is a structured tree over canonicalized before/after data. See `cli/diff/types.ts` for `DiffNode` and `DiffMeta`, `cli/diff/build.ts` for `buildDiff(before, after, meta)` and `cli/diff/render.ts` for `renderExportDiff(root, { full })`. `buildDiff` compares canonicalized plain objects; `renderExportDiff` flattens the tree to `StyledLine[]` with context collapsing (default: 2 unchanged lines around each change; `--full` emits everything).

`workspace-file.ts#canonicalize` sorts object keys alphabetically and sorts arrays whose elements are all primitives lexicographically. This affects the written file's array order and ensures the preview diff matches the file that would be written.

## Export pipeline

`runExport` in `package/src/cli/commands/export.ts` runs the following stages in order:

1. `evaluatePluginConfig` — static AST evaluation of the config source.
2. `freeze(config)` — validates `name` and all fields; yields `{ base, manifest, name }`.
3. Filter `base` to `WORKSPACE_FIELDS` → `managed`.
4. `effectiveManaged(managed, local, parsed, manifest, rootName)` — applies `excludeByRepo` to `publicHoistPattern` (using the map from `manifest`), then per-field local directives (always including the `overrides` default-preserve step). See `cli/effective.ts`.
5. `overlayWorkspace(effective, parsed)` → `merged`.
6. `renderWorkspace(merged)` → `rendered` YAML string.
7. `buildDiff(canonicalize(parsed), canonicalize(merged), meta)` → diff tree (always computed; used only in dry-run/preview paths).
8. Write (write path) or return diff (dry-run/preview path).

## Local merge semantics

`package/src/define-plugin.ts` exports `LocalDirective<T>`: `{ preserve?, value?, strategy? }`. The `local` field of `PluginConfig` accepts either a raw value or a `LocalDirective` for each key.

`package/src/cli/local-merge.ts` provides `isLocalDirective(v)` (detects the directive form by checking that all keys are a subset of the known directive keys, so a real override record with foreign keys is treated as a bare value) and `applyLocalDirective(managed, raw, parsed, field)`.

Semantics per call:

- Bare value → overwrite managed.
- `{ value }` → overwrite managed.
- `{ strategy: "union", value }` → record merge `{ ...managed, ...value }` (value wins on key clash) or array set-union.
- `{ strategy: "difference", value }` → remove keys in `value` from managed record, or remove elements from managed array.
- `{ strategy: "merge", value }` → union semantics (an alias used by `local.patchedDependencies` to upsert owned keys while preserving unowned ones).
- `{ strategy: "rewrite" }` → passthrough; the directive carries no value and the actual rewrite happens in the patch pipeline (see [Patch distribution](#patch-distribution)).
- `preserve` (overrides only, after the above) → copy back any entry from `parsed.overrides` whose value string starts with `<proto>:` for proto in the preserve list. Defaults to `["file", "link", "workspace", "portal"]` when absent.

The `strategy` union is `"union" | "difference" | "merge" | "rewrite"`, defined on `LocalDirective<T>` in `package/src/define-plugin.ts`.

`effectiveManaged` in `package/src/cli/effective.ts` composes `excludeByRepo` (applied first) and per-field local directives for all keys in `config.local` plus `overrides` (always, for the default-preserve step).

`vanillaManaged` in `effective.ts` applies only `excludeByRepo` and no local directives; this is the "fresh consumer" base used by the Simulated preview view.

`local` is export-time only — `freeze`, `base` and the bundled runtime pnpmfile are unaffected.

## Patch distribution

A plugin author can distribute pnpm dependency patches through their config-dependency plugin. The discovery and path-rewrite logic lives in the build/CLI-side module `package/src/patches/` (`keys.ts`, `paths.ts`, `discover.ts`, `build.ts`, `reconcile.ts`), shared by the build plugin and `export` so both emit agreeing paths. It is never imported by `runtime/**` — the Effect-at-build-time boundary holds. The full intended behavior is in [the patch distribution spec](specs/2026-06-30-patch-distribution-design.md); this section records the export-side shipped surface.

Convention: `discoverPatches` walks two folders adjacent to the build file. `public/patches/` is **distributed** — the bundler ships `public/` into the package, so each file resolves in a consumer at `node_modules/.pnpm-config/<name>/<rel>` and is rewritten into `base.patchedDependencies` at build time. `patches/` (pnpm's default `patchesDir`) is **local-only** — never rewritten, never entered into `base`. Ownership is per-plugin, scoped by `name`: a plugin claims only patches under its own adjacent folders, so multiple config-deps and the repo's own `patches/` coexist; collisions are the user's to inspect via `preview` (no engine warning), and `mapChildWins` reconciles local-vs-distributed at install.

Authoring directives (no new top-level field):

- `patchedDependencies: { strategy: "rewrite" }` — discover `public/patches/` and rewrite each to its distributed path. Default behavior when patch files exist; the bare-map form remains the full-manual escape hatch.
- `local.patchedDependencies: { strategy: "merge" }` — on `export`, upsert this plugin's owned keys with their local on-disk paths, preserving every key it does not own.
- `local.localPatchesDir?: string` — override the distributed source root (default `public/patches/`). KNOWN LIMITATION: when this points outside `public/`, `distributedRel`'s basename fallback produces a `node_modules/.pnpm-config/<name>/<basename>/...` path that the bundler (which ships only `public/`) will not actually contain, so a non-public `localPatchesDir` can dangle. The intended case is a `public/` subfolder.

Export behavior: `runExport` pre-resolves the config before `freeze`, then OVERRIDES `effective.patchedDependencies` with the local on-disk paths merged by key over the existing `pnpm-workspace.yaml`. Siblings (other plugins' and repo-own entries) are preserved and the distributed `.pnpm-config` path never leaks into the local file. `runExport` also returns a `reconcile` report (`reconcilePatches`, a `PatchReconcileReport`); the `export` command prints stale-entry and key-mismatch warnings to stderr. `getFrozen` in `package/src/plugin/index.ts` freezes `withResolvedBuildPatches(config, process.cwd())`, so the emitted pnpmfile's `base.patchedDependencies` carries distributed paths — discovery roots at `process.cwd()`, which equals the build-config package dir under normal tsdown/rolldown/turbo invocation (matching the export CLI's `dirname(configFile)` root).

The descriptor table is unchanged: `patchedDependencies`/`patchesDir`/`configDependencies` descriptors stay as-is and `patchesDir` is never read by the new code. See [settings-coverage.md](settings-coverage.md).

## Preview views

`package/src/cli/preview-views.ts` exports `buildPreviewViews(input)` which returns `{ changes, full, simulated }` as `StyledLine[]` triples.

- **Changes** / **Full**: `buildDiff(canonicalize(parsed), canonicalize(merged), meta)` rendered with `{ full: false }` and `{ full: true }` respectively. `meta.localKeys` are the keys in `config.local`; `meta.managedKeys` is `WORKSPACE_FIELDS`.
- **Simulated**: `buildDiff(canonicalize(parsed), canonicalize(vanilla), meta)` with `{ full: false }`. `vanilla` is `vanillaManaged(managed, manifest, rootName)` — no local overlay, no preserve. Keys present in `parsed` but absent from the vanilla output (unmanaged keys like `packages`, plus local-protocol overrides) appear as `removed`, annotated as "unique to your repo."

`package/src/cli/ui/Preview.ts` is the Ink component: a `Tabs` bar via `ink-tab` over the three pre-built views; tab switch is local state; `q`/Esc exits. It maps `StyledLine[]` to Ink `Box`/`Text` elements directly (no `toAnsi`), making this the phase-2 consumer of the shared contract.

`package/src/cli/ui/run-preview.ts` provides `runPreview(views): Effect<void>` — the `render` + `waitUntilExit` bridge, mirroring `run-walk.ts`.

`package/src/cli/commands/preview.ts` exports `runPreviewViews(opts)` (the testable pure core) and `previewCommand` (the `effect/unstable/cli` command).

## Rationale

### Shared render layer, not per-command ad hoc color

A single `StyledLine` → `toAnsi` → ANSI string path means both `export --dry-run` and `upgrade --preview` speak the same visual language (same gutter symbols, same palette) without duplicating ANSI code logic. Capability detection is centralized in one module; render functions stay pure and unit-testable without env mocking.

### `--dry-run` replaces `--preview` on `export`

`export --preview` conflated two concerns (write vs. show). Separating them into `export --dry-run` (static, pipe-safe) and `preview` (interactive, with fallback) makes each command do one thing.

### Default override preservation

Managed-field writes previously replaced `overrides` wholesale, silently dropping local `file:` links. The default-preserve step runs on every `export` (not just when `local.overrides` is set), making the safe behavior opt-out rather than opt-in.

### `local` is post-freeze, export-time only

The runtime pnpmfile must be the same for every consumer of the plugin. Per-repo local adjustments belong only in the export step, not in the shared bundled artifact.

## Related documentation

- [architecture.md](architecture.md) — the engine, the `PluginConfig.name` requirement and the `createHooks` contract the export pipeline depends on.
- [upgrade-cli.md](upgrade-cli.md) — the `upgrade` command that shares the `StyledLine`/`toAnsi`/`env.ts` render layer.
- [the cli diff/render design spec](specs/2026-06-29-cli-diff-render-design.md) — the original design rationale for the shared render layer.
- [the export/preview design spec](specs/2026-06-29-export-local-merge-preview-design.md) — the original design rationale for the command split, local merge semantics and preview views.
- [the patch distribution spec](specs/2026-06-30-patch-distribution-design.md) — the ownership model, path rewrite and reconcile design for distributing dependency patches.
- `package/src/patches/` — the shared build/CLI patch discovery and path-rewrite module (`keys.ts`, `paths.ts`, `discover.ts`, `build.ts`, `reconcile.ts`).
- `package/src/cli/commands/export.ts` and `package/src/cli/commands/preview.ts` — the command implementations.
- `package/src/cli/ui/` — the shared render layer (`styled.ts`, `ansi.ts`, `env.ts`, `Preview.ts`, `run-preview.ts`).
- `package/src/cli/diff/` — the diff model (`types.ts`, `build.ts`, `render.ts`).
- `package/src/cli/local-merge.ts`, `package/src/cli/effective.ts` and `package/src/cli/preview-views.ts` — the local-merge engine and view builders.
