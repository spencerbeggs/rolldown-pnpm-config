---
type: Decision
title: Shared StyledLine render layer, not per-command ad hoc color
description: One StyledLine → toAnsi → ANSI path is shared by export --dry-run, preview and the upgrade summary, with capability detection centralized and threaded in as flags.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: styled-ts
    resource: package/src/cli/ui/styled.ts
  - id: env-ts
    resource: package/src/cli/ui/env.ts
  - id: ansi-ts
    resource: package/src/cli/ui/ansi.ts
tags:
  - architecture
---

# Shared StyledLine render layer, not per-command ad hoc color

## Context

`export --dry-run`, the interactive `preview` command, and the `upgrade`
summary all need to present "what would change" to the author. Left
uncoordinated, each command would grow its own ANSI code paths and its own
reading of the terminal environment, risking green/red/yellow meaning
drifting apart between commands over time, and making every command
responsible for correctly guarding against `NO_COLOR`, non-TTY, and CI
output on its own.

## Decision

A single `StyledLine` → `toAnsi` → ANSI-string path, defined once in
`package/src/cli/ui/`, is shared by `export --dry-run`, `preview`, and the
`upgrade` summary. `StyledLine` (`package/src/cli/ui/styled.ts:23`) carries
an `indent` depth, a single-character `gutter` symbol (`+`/`~`/`-`/`
`/`·`/`░`/`⚠`), a list of `Segment`s each with a `ChangeStyle` and a text
run, and an optional `DiffTag`; gutters and tags are always present so
output stays meaningful with color off. `toAnsi(lines, { color }): string`
in `package/src/cli/ui/ansi.ts:11` is a pure function that maps
`StyledLine[]` to a colored or plain terminal string and never reads the
environment.

Capability detection (color, interactivity, hyperlinks) is centralized in
one wrapper, `package/src/cli/ui/env.ts` — the only module that imports
`std-env` and `std-osc8`. `detectCapabilities()` (`env.ts:20`) returns
`{ color, interactive, hyperlinks }`: `interactive` is `hasTTY && !isCI &&
!isAgent` (`env.ts:23`) and `color` is `isColorSupported` from `std-env`.
These flags are threaded into render functions as parameters rather than
read by them, so `toAnsi` and every render function stay pure and
unit-testable without env mocking.

`cli/ui/legend.ts` exports `legendLines()` and `simulatedLegendLines()`,
each swatch carrying the matching `ChangeStyle` so the legend tracks the
palette automatically; a legend is prepended only when color is on. The
`ChangeStyle` palette itself (`styled.ts:2`) is the single source of truth
for meaning-to-color mapping: it includes `merge`/`overwrite` (cyan/magenta,
`styled.ts:41-42`) for the Simulated-view annotations and a fixed
256-color gray for `unmanaged` (`styled.ts:38`) distinct from dim
`unchanged`.

## Alternatives rejected

- **Per-command ad hoc ANSI logic.** Each of `export`, `preview`, and
  `upgrade` growing its own color/gutter scheme was rejected because it
  duplicates ANSI code logic and risks the same gutter or color meaning
  drifting apart across commands.
- **Render functions reading the environment directly.** Having
  `toAnsi`/render functions call into `std-env`/`std-osc8` themselves was
  rejected because it couples pure rendering logic to environment state,
  forcing env mocking in every render-layer test.
- **Hand-rolled color/TTY detection.** Rolling custom
  `NO_COLOR`/`FORCE_COLOR`/TTY/CI detection was rejected in favor of the
  zero/light-dependency `std-env` and `std-osc8` packages, which already
  handle these cases correctly.

## Consequences

- Any new CLI command that needs to show a diff or summary reuses
  `StyledLine`/`toAnsi`/`env.ts` rather than inventing its own render path.
- The only module permitted to import `std-env` or `std-osc8` is
  `cli/ui/env.ts`; a render function that reads the environment directly is
  a regression against this decision.
- Adding a new `ChangeStyle` (as happened for `merge`/`overwrite`) is a
  layer-wide palette change, not a per-command one, since the legend derives
  its swatches from the same enum.
- The Ink-based `preview` UI maps `StyledLine[]` to `Box`/`Text` directly
  (no `toAnsi`), making it a second consumer of the same shared contract
  rather than a second implementation of it.
