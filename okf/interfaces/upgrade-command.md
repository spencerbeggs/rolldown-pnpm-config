---
type: Interface
title: upgrade command
description: The consumer-facing contract of `rolldown-pnpm-config upgrade [file]`.
kind: cli
resource: ../../package/src/cli/commands/upgrade.ts
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: upgrade-ts
    resource: ../../package/src/cli/commands/upgrade.ts
  - id: bin-ts
    resource: ../../package/src/cli/bin.ts
---

# upgrade command

## File argument and autodetect

`rolldown-pnpm-config upgrade [file]` takes an optional file argument
(`fileArg`, `package/src/cli/commands/upgrade.ts:779`). When omitted,
`resolveTargetFile` scans the current working directory via
`findConfigFiles`/`pickConfigCandidate` and fails when it finds zero or
more than one candidate.[^upgrade-ts]

## Flags

Declared at `package/src/cli/commands/upgrade.ts:780-786`:

- `--yes` / `-y` — resolve non-interactively, taking latest-in-range for
  every entry (`runUpgrade`, invoked at `upgrade.ts:870-877`). Never
  applies a major bump. A workspace-sourced entry (`source: "workspace"`)
  is the one exception: it takes its sole non-keep candidate even when
  that value falls outside the current range, because a 0.x caret
  routinely excludes the workspace's own next minor
  (`upgrade.ts:356-365`).[^upgrade-ts]
- `--dry-run` — runs the identical flow as an unflagged (or `--yes`) run
  — discover, resolve, plan, interop reconcile, validate, render the
  summary — and skips only the final file write; it is not a separate
  code path (`upgrade.ts:915-919`, `upgrade.ts:446-451`).[^upgrade-ts]
- `--catalog <name>` — restricts discovery to entries in one named
  catalog (`catalogOption`, `upgrade.ts:782`, applied via
  `filterEntriesByCatalog` at `upgrade.ts:902`).[^upgrade-ts]
- `--preview` — a non-interactive projection: discover → resolve → plan
  → take the default picks → print a colored summary → exit; no walk, no
  write (`runUpgradePreview`, `upgrade.ts:567-601`).[^upgrade-ts]
- `--full` — includes up-to-date packages in the non-interactive
  projection printed by `--preview` and by the non-TTY fallback
  (`projectDecisions`, `upgrade.ts:534-564`). It has no effect on the
  interactive table, which always shows every discovered row.[^upgrade-ts]
- `--check` — a pure drift gate; see below.
- `--json` — machine-readable single-line JSON output; `validateJsonMode`
  (`upgrade.ts:744-761`) rejects it unless combined with `--check`,
  `--yes`, or `--dry-run` — never with `--preview` or the bare
  interactive default.[^upgrade-ts]

## Interactive default and non-TTY/CI fallback

The default (no `--yes`/`--check`/`--preview`/`--json`) path enters an
interactive table showing every discovered row, up-to-date rows included
as non-selectable context, with the cursor starting on the first
actionable row (`upgrade.ts:929-940`).[^upgrade-ts]

When the terminal is not interactive (`caps.interactive` from
`cli/ui/env.ts` is false), the command skips the walk and prints the
non-interactive projection instead of entering raw mode and hanging
(`upgrade.ts:920-928`).[^upgrade-ts]

## The `minimumReleaseAge` gate

`computeGate` (`upgrade.ts:88-108`) combines the config-declared and
pnpm-resolved release-age gates, and every version list `resolveGatedVersions`
returns is filtered through it before `plan` or interop ever see it
(`upgrade.ts:130-204`). This runs on every invocation regardless of flag.
A workspace-sourced entry is exempt from the gate rather than blocked by
it, since its version is unpublished and came from this repo's own
manifests and pending changesets, not the registry
(`upgrade.ts:161-168`).[^upgrade-ts]

## `--check` exit-code contract

`--check` resolves exactly as `--yes` would (same `runUpgrade` call),
forces dry-run regardless of other flags, and never writes
(`upgrade.ts:826-851`). The exit code is the contract:

- `0` — every entry is in sync (`checkOutcome`, `upgrade.ts:611-622`).
- `1` — a `--yes` run would rewrite something, **or** the run failed to
  resolve (an `UpgradeError` — a typo'd package name, a registry auth
  failure, or a peer-strategy warning; `checkFailureOutcome`,
  `upgrade.ts:624-642`). Both share the single non-zero exit code, so the
  output must distinguish the two families.

Two distinguished output families:

- Drift and in-sync go to **stdout**: `Catalog drift detected in N
  package(s): ...` or `Catalogs are in sync.` (`upgrade.ts:611-622`).
- A resolution failure goes to **stderr**, prefixed `Catalog check
  failed before drift could be evaluated (resolution error, not
  drift):` (`upgrade.ts:640`).

Each drift row is annotated with its version source:
`<catalog>.<pkg>  (workspace)` or `<catalog>.<pkg>  (registry)` — **two
spaces** before the paren (`upgrade.ts:617`).[^upgrade-ts]

## No `up` alias, no `-i`/`--interactive` flag

The command is registered under the single name `"upgrade"`
(`Command.make("upgrade", ...)`, `upgrade.ts:796-797`) and is wired into
the root command's subcommand list with no alias
(`bin.ts:9`).[^upgrade-ts][^bin-ts] The flag set declared at
`upgrade.ts:780-786` has no `-i`/`--interactive` entry; interactive is
simply the behavior when none of `--yes`/`--check`/`--preview`/`--json`
is passed.

[^upgrade-ts]: upgrade-ts
[^bin-ts]: bin-ts
