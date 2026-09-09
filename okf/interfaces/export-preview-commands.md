---
type: Interface
title: export and preview commands
description: The consumer-facing contract of `rolldown-pnpm-config export [path]` and `rolldown-pnpm-config preview [path]`.
kind: cli
resource: ../../package/src/cli/commands/export.ts
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: export-ts
    resource: ../../package/src/cli/commands/export.ts
  - id: preview-ts
    resource: ../../package/src/cli/commands/preview.ts
---

# export and preview commands

## `export [path]`

Runs the effective pipeline — freeze, filter to workspace fields,
`excludeByRepo`, local directives, overlay, write — and materializes the
result into the consuming repo's `pnpm-workspace.yaml`
(`runExport`, `package/src/cli/commands/export.ts:52-155`). Prints
`Exported to <path>` on success (`export.ts:190`).[^export-ts] It also
prints stale-entry and key-mismatch warnings to stderr from the patch
reconcile report (`export.ts:191-194`).[^export-ts]

## `export [path] --dry-run [--full]`

Runs the same pipeline but skips the write (`export.ts:148`). Prints a
colored canonical diff to stdout — a color legend precedes it when the
terminal supports color — prefixed with `<path> (dry run — not written)`
(`export.ts:185-189`). `--full` emits the entire canonical tree rather
than changed lines plus surrounding context (`export.ts:146`, `fullFlag`
at `export.ts:159`).[^export-ts]

## `preview [path]`

An interactive `ink-tab` explorer over three views — Changes, Full, and
Simulated (`buildPreviewViews`, `package/src/cli/preview-views.ts`,
consumed at `preview.ts:53-59`). When the terminal is non-interactive
(`!caps.interactive`), `preview` falls back to printing the Changes view
via `toAnsi` and exits rather than entering the interactive Tabs UI
(`preview.ts:82-90`).[^preview-ts]

## File argument

The file arg is optional on both commands (`pathArg`, `export.ts:157`,
`preview.ts:63`); when the workspace path is not passed explicitly,
`findWorkspaceFile` locates the nearest `pnpm-workspace.yaml` from the
process's current working directory (`export.ts:85`,
`preview.ts:44`).[^export-ts][^preview-ts]

[^export-ts]: export-ts
[^preview-ts]: preview-ts
