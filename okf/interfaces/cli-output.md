---
type: Interface
title: CLI output, audience and exit codes
description: What every rolldown-pnpm-config subcommand promises a script, an agent or a person about who its output is for, which stream each line lands on, colour, and its exit code.
kind: cli
resource: ../../package/src/cli/main.ts
status: draft
generated:
  by: okfit/claude-code
  at: 2026-10-08T03:36:55Z
  body_sha256: cf7628d9bd6a44e23d03651a2f3a72fa50a7bdb73c62e731c8b9000354221f13
sources:
  - id: main
    resource: ../../package/src/cli/main.ts
  - id: root
    resource: ../../package/src/cli/root.ts
  - id: upgrade
    resource: ../../package/src/cli/commands/upgrade.ts
  - id: bin-e2e
    resource: ../../package/__test__/e2e/bin.e2e.test.ts
  - id: rows
    resource: ../../package/src/cli/render/print.ts
  - id: screens
    resource: ../../package/src/cli/ui/screens.ts
  - id: session
    resource: ../../package/__test__/cli/upgrade-session.int.test.ts
tags:
  - dx
---

# CLI output, audience and exit codes

## Audience

Every subcommand accepts `--audience human|agent|ci` and the shorthands
`--human`, `--agent` and `--ci`, shared from the root command.[^root] With
no flag, `ROLLDOWN_PNPM_CONFIG_AUDIENCE` decides, then agent detection, then
CI detection, then human.[^main] More than one audience flag is a usage
error.

- **human** — ANSI colour when the terminal supports it, and the
  interactive screens when stdin and stdout are both terminals.
- **agent** — plain text, never an escape sequence, never a screen.
- **ci** — plain text, rendered as a GitHub Actions log under Actions;
  never a screen.

Colour follows Node: `FORCE_COLOR` (when set) wins over `NO_COLOR`;
`NO_COLOR`, `NODE_DISABLE_COLORS` and `TERM=dumb` turn it off; a stream
that is not a terminal gets none.

## Streams

- **stdout** carries the product: diffs, summaries, `--check`'s drift
  report, and under `--json` exactly one single-line JSON document and
  nothing else.[^upgrade]
- **stderr** carries warnings (unresolvable packages, interop conflicts,
  stale patch entries), every failure report, and the help that
  accompanies a usage error.[^bin-e2e]
- One-line outcomes (`Exported to …`, `Applied N change(s).`) carry a
  status glyph; success and info go to stdout.
- Line-oriented rows — a diff row, a summary table row, a `--check` drift
  row — are never wrapped, at any width: each stays on one line with its
  gutter, so a grep or a line-by-line reader sees every row whole. Output
  that is piped, or read by an agent or CI, has no width limit at all; only
  prose beside the rows (a heading, a note) wraps at a person's
  terminal.[^rows]
- The resolve-progress spinner draws only on an interactive terminal; any
  other run gets nothing from it on either stream.[^screens]

Diagnostics are off by default; `--log-level` or
`ROLLDOWN_PNPM_CONFIG_LOG_LEVEL` turns them on, on stderr.[^main]

## Exit codes

| code | when |
| --- | --- |
| `0` | success, including `--help`, `--version`, `--check` in sync, and closing an interactive screen with Esc (`cancelled; nothing written`) |
| `1` | `--check` found drift, or any failure that is not a usage error or an interrupt (missing config, registry resolution, unsatisfiable range) |
| `64` | usage error: an unknown flag, a missing argument, more than one audience flag, `--json` without `--check`/`--yes`/`--dry-run` or with `--preview` |
| `130` | the user interrupted an interactive screen with Ctrl-C; nothing was written |

The `preview` explorer is read-only, so closing it any way exits `0`. These
codes are pinned by spawning the built bin;[^bin-e2e] the upgrade
table's Esc and Ctrl-C outcomes are pinned by driving the command under a
UI test session.[^session]

[^main]: ../../package/src/cli/main.ts
[^root]: ../../package/src/cli/root.ts
[^upgrade]: ../../package/src/cli/commands/upgrade.ts
[^bin-e2e]: `../../package/__test__/e2e/bin.e2e.test.ts`
[^session]: ../../package/**test**/cli/upgrade-session.int.test.ts
[^rows]: ../../package/src/cli/render/print.ts
[^screens]: ../../package/src/cli/ui/screens.ts
