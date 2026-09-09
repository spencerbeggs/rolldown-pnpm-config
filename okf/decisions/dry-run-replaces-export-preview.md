---
type: Decision
title: "--dry-run replaces --preview on export"
description: export --preview conflated write-vs-show; the split is a static export --dry-run and a standalone interactive preview command with a non-TTY fallback.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: export-command
    resource: package/src/cli/commands/export.ts
  - id: preview-command
    resource: package/src/cli/commands/preview.ts
  - id: upgrade-command
    resource: package/src/cli/commands/upgrade.ts
tags:
  - architecture
---

# `--dry-run` replaces `--preview` on `export`

## Context

`export` originally had a single `--preview` flag that conflated two
concerns: writing the file and showing what would change. That flag
printed the canonical `pnpm-workspace.yaml` as plain YAML, with no diff and
no color, so an author had no way to see what would actually change on
disk before committing to a write, and no way to explore the file
interactively without also risking a write.

## Decision

`export --preview` is removed. `export [path]` always writes and prints
`Exported to <path>` on success. `export [path] --dry-run [--full]`
(`package/src/cli/commands/export.ts:158-190`) runs the identical pipeline
but skips the write, printing a colored canonical diff to stdout instead;
`--full` (`export.ts:159`) emits the entire canonical tree rather than
changed lines plus context, and the command writes nothing either way
(`export.ts:181-190`).

A new standalone `preview [path]` command
(`package/src/cli/commands/preview.ts`) provides the interactive tabbed
view (Changes / Full / Simulated) via `ink-tab`, reusing
`buildDiff`/`renderExportDiff`/`toAnsi` from the shared render layer. When
the terminal is non-interactive (`!detectCapabilities().interactive`,
`preview.ts:82-88`), `preview` falls back to printing the Changes view via
`toAnsi` and exits — it never hangs in CI or piped output.

This same split reads differently on `upgrade`: its `dryRun` option
(`package/src/cli/commands/upgrade.ts:249`) computes everything for real —
resolve, plan, edits — and skips only the final write, running through the
identical interactive path unless `--yes` is also passed. `export`'s
`--dry-run` is fully static and never prompts. A reader moving between the
two commands should not assume `--dry-run` means the same thing on both:
`export`'s is the non-interactive, pipe-safe half of the old `--preview`
split, while `upgrade`'s is the normal session with the write suppressed at
the end.

## Alternatives rejected

- **Keep a single `export --preview` flag and fix only the data-loss bug.**
  Rejected because the flag's two meanings (write vs. show) would keep
  colliding — a future feature that needs "show without writing" and
  another that needs "interactive explore" cannot both hang off one
  boolean flag without one of them being awkward.
- **Make `preview` a mode of `export` rather than a separate command.**
  Rejected in favor of a dedicated `preview` command: the interactive
  `ink-tab` explorer is a materially different interaction model (three
  tabbed views, a render loop) from the static, pipe-safe `--dry-run`
  path, and conflating them back into one command would reintroduce the
  original problem this decision fixes.

## Consequences

- Any documentation or muscle memory referencing `export --preview` is
  stale; the replacement is `export --dry-run` for static output or
  `preview` for the interactive explorer.
- `export --dry-run` and `preview` both reuse
  `buildDiff`/`renderExportDiff`/`toAnsi`, so a change to the diff model or
  render layer affects both consistently.
- `preview`'s non-interactive fallback is load-bearing for CI and agent
  contexts: any future interactive command reusing this pattern needs the
  same `detectCapabilities().interactive` guard to avoid hanging.
- `--dry-run` carries a different meaning on `export` (static, no prompts)
  than on `upgrade` (interactive walk, write suppressed); this must be
  stated explicitly in user-facing help text and in any future decision
  touching either command, not left implicit.
