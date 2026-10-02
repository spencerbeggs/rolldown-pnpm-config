---
type: Interface
title: export and preview commands
description: The consumer-facing contract of `rolldown-pnpm-config export [path]` and `rolldown-pnpm-config preview [path]`.
kind: cli
resource: ../../package/src/cli/commands/export.ts
generated:
  by: okfit/claude-code
  at: 2026-10-02T15:35:24Z
  body_sha256: d2d36fce80189ff2a1aca2bbf76c8d16812961a9f51c35b8fd03dc9ea9257be0
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
(`runExport`, `package/src/cli/commands/export.ts`). Prints a success
line, `✓ Exported to <path>`, on stdout.[^export-ts] It also prints
stale-entry and key-mismatch warnings to stderr from the patch reconcile
report.[^export-ts]

## `export [path] --dry-run [--full]`

Runs the same pipeline but skips the write. Prints the canonical diff to
stdout, headed `<path> (dry run — not written)`; for a person at a colour
level the diff is coloured and a legend precedes it, and for an agent or a
pipe it is plain text whose gutters (`+`/`-`/`~`) and tags (`(local)`,
`(unmanaged)`) carry the meaning (see [CLI output](cli-output.md)).
`--full` emits the entire canonical tree rather than changed lines plus
surrounding context.[^export-ts]

## `preview [path]`

An interactive tabbed explorer over three views — Changes, Full, and
Simulated (`buildPreviewViews`, `package/src/cli/preview-views.ts`) — each
scrolling to fit the terminal. Tab and Shift-Tab switch views; `q`,
Enter, Esc and Ctrl-C all close it with exit `0`, since it is read-only.
When the run cannot prompt (`CliInteractive` is false), `preview` prints
the Changes view instead and exits.[^preview-ts]

## File argument

The file arg is optional on both commands (`pathArg` in `export.ts` and
`preview.ts`); when the workspace path is not passed explicitly,
`resolveWorkspacePath` locates the nearest `pnpm-workspace.yaml` upward
from the directory the CLI was invoked in.[^export-ts][^preview-ts]

[^export-ts]: export-ts
[^preview-ts]: preview-ts
