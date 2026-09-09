---
type: Interface
title: StyledLine
description: The shared render-layer contract for colored CLI output across export, preview, and upgrade.
kind: api
resource: ../../package/src/cli/ui/styled.ts
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: styled-ts
    resource: ../../package/src/cli/ui/styled.ts
  - id: ansi-ts
    resource: ../../package/src/cli/ui/ansi.ts
  - id: env-ts
    resource: ../../package/src/cli/ui/env.ts
  - id: preview-command-ts
    resource: ../../package/src/cli/ui/Preview.ts
---

# StyledLine

## The contract

`StyledLine` (`package/src/cli/ui/styled.ts:24-29`) is a list of styled
lines: each carries an `indent` depth, a single-character `gutter`
(`+`/`~`/`-`/` `/`·`/`░`/`⚠`), a list of `Segment`s (text plus a
`ChangeStyle`), and an optional `DiffTag` (`"local"` or
`"unmanaged"`).[^styled-ts]

## The two consumers

- `toAnsi(lines, { color }): string` (`package/src/cli/ui/ansi.ts:11-19`)
  — maps `StyledLine[]` to a colored (or plain, when `color` is false)
  terminal string. Called from `export.ts:189` (`--dry-run`),
  `preview.ts:88` (the non-interactive fallback), and
  `upgrade.ts` output paths that render `renderSummary`'s
  `StyledLine[]`.[^ansi-ts]
- A single pure mapping of `StyledLine[]` to Ink `Text`/`Box` elements
  (`renderLines`, `package/src/cli/ui/Preview.ts:40`), consumed by the
  interactive `preview` Tabs-bar component.[^preview-command-ts]

## Render functions never read the environment

`toAnsi` is documented as "Pure: color is decided by the caller, never
read from the environment" (`ansi.ts:7`).[^ansi-ts] Capability detection
— color support, interactivity, hyperlink support — is centralized in
`detectCapabilities()` (`package/src/cli/ui/env.ts:20-26`), which is the
only function reading `std-env`/`std-osc8`, and its result is threaded
into callers as explicit flags (`{ color }`, `{ full }`, and so
on).[^env-ts]
