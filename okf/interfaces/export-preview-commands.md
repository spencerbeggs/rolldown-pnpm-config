---
type: Interface
title: export and preview commands
description: The consumer-facing contract of `rolldown-pnpm-config export [path]` and `rolldown-pnpm-config preview [path]`.
kind: cli
resource: ../../package/src/cli/commands/export.ts
generated:
  by: okfit/claude-code
  at: 2026-11-05T22:58:21Z
sources:
  - id: export-ts
    resource: ../../package/src/cli/commands/export.ts
  - id: preview-ts
    resource: ../../package/src/cli/commands/preview.ts
integrity:
  generated:
    body: c7d671aaf8699a82
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

An existing `pnpm-workspace.yaml` is edited in place rather than
re-rendered. Comments, the author's key order, each scalar's quoting, line
endings and every unchanged line are kept, and a list gains or loses only
the items that changed. Inserted content follows the file's own indent width,
sequence indentation and quote style, including quoting new keys, values or
list items where their siblings quote by choice; new keys append to their
mapping. A file whose edits would not parse back to the intended result
(anchors, merge keys, colliding keys) is re-rendered whole in its own style.
A new or empty file is rendered from scratch with sorted keys, 2-space
indent, unindented sequences and single quotes. See
[the write-path decision](../decisions/workspace-write-path.md).[^export-ts]

The write is atomic: a temp file beside the target, then a rename over it, so a
crash leaves the old content or the new content, whole. A symlinked target keeps
its link and a file keeps its mode. The directory must be writable as well as
the file, and a read-only target is refused rather than overwritten; either
fails with `Cannot write <path>` and leaves the file untouched.[^export-ts]

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
