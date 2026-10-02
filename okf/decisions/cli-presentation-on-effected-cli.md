---
type: Decision
title: CLI presentation through the @effected/cli kit
description: The CLI's audience detection, colour, document rendering, failure reporting, exit codes, prompts and Ink screens all come from @effected/cli; the producers emit the kit's Doc IR directly and no module reads process outside the entry files.
status: draft
supersedes: shared-styled-line-render-layer.md
generated:
  by: okfit/claude-code
  at: 2026-10-02T15:35:24Z
  body_sha256: a76cfba0fa2c75e56163cfb9bee91583f1625d2751ccc38396d3a819f9d9ce43
sources:
  - id: main
    resource: ../../package/src/cli/main.ts
  - id: tone
    resource: ../../package/src/cli/render/tone.ts
  - id: screens
    resource: ../../package/src/cli/ui/screens.ts
  - id: boundary-test
    resource: ../../package/__test__/cli/process-boundary.test.ts
  - id: bin-e2e
    resource: ../../package/__test__/e2e/bin.e2e.test.ts
  - id: owner
    resource: conversation with the repository owner
    author: human:spencerbeggs
    last_modified: 2026-10-02T00:00:00Z
tags:
  - architecture
  - dx
---

# CLI presentation through the @effected/cli kit

## Context

The CLI grew its own presentation layer: a `StyledLine` IR rendered to ANSI
by a hand-written SGR palette, `std-env` for colour and interactivity,
`ink-tab` and hand-mounted Ink trees for the two interactive views, a
carriage-return progress counter on stderr, and `runMain`'s default failure
output. That layer knew nothing about who was reading — an agent and a CI log
got the same bytes as a person — and every exit was `1`, so a script could
not tell a usage error or a quit from a resolution failure. The Effect v4
`@effected` kit ships exactly that missing boundary in `@effected/cli`, built
on `effect/cli`, which this CLI already used for parsing.

## Decision

The CLI is wired the kit's one way: `Command.withSharedFlags(CliAudience.flags())`
on the root and `CliRuntime.main(CliAudience.run(root, { version }), { platform,
env })` in `main.ts`.[^main] The kit therefore owns:

- **Audience and interactivity.** `--audience`/`--human`/`--agent`/`--ci`
  and `ROLLDOWN_PNPM_CONFIG_AUDIENCE` decide who output is for, and
  `CliInteractive` decides whether a run may mount a screen.
- **Rendering.** The producers (diff, Simulated view, upgrade summary,
  legend) build `Doc` blocks directly through one tone palette mapped to
  theme tokens,[^tone] and `Doc.print` picks the renderer: ANSI for a
  person, plain for an agent, the GitHub log under Actions.
- **Failures and exit codes.** Each CLI error draws itself through `CliDoc`;
  usage errors exit 64, a quit (Esc, Ctrl-C) exits 130, `--check` drift exits 1
  through `CliExit.set`, and every other failure exits 1.[^bin-e2e] The owner
  chose this table over keeping a single non-zero code.[^owner]
- **Screens.** The upgrade table, the preview explorer and the resolve
  progress view are kit screens (`CliUi.run`, `CliUi.live`) in `.tsx`
  modules loaded only on mount, so a non-interactive run never loads
  React.[^screens]

The working directory, argv, stderr's terminal state and the version are read
only in `bin.ts`, `main.ts` and `version.ts` and passed down as values; a
`SourceBoundary` scan pins that.[^boundary-test]

## Alternatives rejected

- **Keep `StyledLine` and render it through `Doc` with an adapter.**
  Rejected by the owner in favour of emitting `Doc` directly: an adapter
  would keep two IRs for one job.[^owner]
- **Keep every exit at 1** (`usageExitCode: 1`, catching `Cancelled`).
  Rejected: it hides the difference between a typo in a flag, a user quitting
  and a broken config from every script that calls the CLI.[^owner]
- **Keep the hand-rolled layer.** Rejected: it duplicated what the kit
  provides and could not serve an agent or CI audience differently.

## Consequences

- An unmanaged diff row now always carries its `(unmanaged)` tag, coloured
  or not, because a `Doc` is built before the renderer's colour level is
  known.
- Product output (diffs, summaries, `--json`) goes to stdout; one-line
  outcomes go through `CliMessage`; warnings and failures go to stderr.
- A new screen goes in its own `.tsx` module behind `CliUi.lazy`, never in a
  command module.

[^main]: ../../package/src/cli/main.ts
[^tone]: ../../package/src/cli/render/tone.ts
[^screens]: ../../package/src/cli/ui/screens.ts
[^boundary-test]: `../../package/__test__/cli/process-boundary.test.ts`
[^bin-e2e]: `../../package/__test__/e2e/bin.e2e.test.ts`
[^owner]: conversation with the repository owner
