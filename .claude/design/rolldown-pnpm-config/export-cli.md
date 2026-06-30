---
status: current
module: rolldown-pnpm-config
category: architecture
created: 2026-06-29
updated: 2026-06-29
last-synced: 2026-06-29
completeness: 90
related:
  - architecture.md
  - upgrade-cli.md
  - specs/2026-06-29-cli-diff-render-design.md
  - specs/2026-06-29-export-local-merge-preview-design.md
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
7. [Preview views](#preview-views)
8. [Rationale](#rationale)
9. [Related documentation](#related-documentation)

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
- `preserve` (overrides only, after the above) → copy back any entry from `parsed.overrides` whose value string starts with `<proto>:` for proto in the preserve list. Defaults to `["file", "link", "workspace", "portal"]` when absent.

`effectiveManaged` in `package/src/cli/effective.ts` composes `excludeByRepo` (applied first) and per-field local directives for all keys in `config.local` plus `overrides` (always, for the default-preserve step).

`vanillaManaged` in `effective.ts` applies only `excludeByRepo` and no local directives; this is the "fresh consumer" base used by the Simulated preview view.

`local` is export-time only — `freeze`, `base` and the bundled runtime pnpmfile are unaffected.

## Preview views

`package/src/cli/preview-views.ts` exports `buildPreviewViews(input)` which returns `{ changes, full, simulated }` as `StyledLine[]` triples.

- **Changes** / **Full**: `buildDiff(canonicalize(parsed), canonicalize(merged), meta)` rendered with `{ full: false }` and `{ full: true }` respectively. `meta.localKeys` are the keys in `config.local`; `meta.managedKeys` is `WORKSPACE_FIELDS`.
- **Simulated**: `buildDiff(canonicalize(parsed), canonicalize(vanilla), meta)` with `{ full: false }`. `vanilla` is `vanillaManaged(managed, manifest, rootName)` — no local overlay, no preserve. Keys present in `parsed` but absent from the vanilla output (unmanaged keys like `packages`, plus local-protocol overrides) appear as `removed`, annotated as "unique to your repo."

`package/src/cli/ui/Preview.ts` is the Ink component: a `Tabs` bar via `ink-tab` over the three pre-built views; tab switch is local state; `q`/Esc exits. It maps `StyledLine[]` to Ink `Box`/`Text` elements directly (no `toAnsi`), making this the phase-2 consumer of the shared contract.

`package/src/cli/ui/run-preview.ts` provides `runPreview(views): Effect<void>` — the `render` + `waitUntilExit` bridge, mirroring `run-walk.ts`.

`package/src/cli/commands/preview.ts` exports `runPreviewViews(opts)` (the testable pure core) and `previewCommand` (the `@effect/cli` command).

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
- `package/src/cli/commands/export.ts` and `package/src/cli/commands/preview.ts` — the command implementations.
- `package/src/cli/ui/` — the shared render layer (`styled.ts`, `ansi.ts`, `env.ts`, `Preview.ts`, `run-preview.ts`).
- `package/src/cli/diff/` — the diff model (`types.ts`, `build.ts`, `render.ts`).
- `package/src/cli/local-merge.ts`, `package/src/cli/effective.ts` and `package/src/cli/preview-views.ts` — the local-merge engine and view builders.
