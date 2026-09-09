---
type: Decision
title: "--yes is strict, interactive is lenient"
description: Every planned edit is validated against the registry before rewrite; interactively a rejection is dropped at whole-package granularity and reported, while --yes fails hard on any warning.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: validate
    resource: package/src/cli/validate.ts
  - id: upgrade-command
    resource: package/src/cli/commands/upgrade.ts
tags: []
---

# "--yes is strict, interactive is lenient"

## Context

Every planned edit the upgrade pipeline produces is validated against the
registry (`rangeIsSatisfiable`, `package/src/cli/validate.ts:29-40`)
before it reaches `rewrite`, regardless of mode: it accepts a range once
at least one published version matches it, checked against the ungated
version list.[^validate] This is a safety net against a range the
pipeline derived wrongly, not a gate on the author's own hand-written
ranges, so it fails open — an empty version list or an unparseable range
passes (`validate.ts:21-25`).[^validate] `validateEdits`
(`validate.ts:60-104`) rejects atomically per package, not per edit: a
`strategy` package produces a `range` edit and a `peer` edit as a pair,
and if either is unsatisfiable both are dropped together, never just the
failing one, since accepting the good half of a pair would leave the file
internally inconsistent and cause every subsequent run to re-report the
same drift and re-reject it forever (`validate.ts:43-51`).[^validate]
Given that a rejection can happen on either code path, the pipeline needs
a rule for what a rejection *means* in each mode.

## Decision

The two modes diverge on what a rejection means, not on whether validation
runs. Interactively, a rejection is dropped and reported in the
confirmation summary at the granularity of a whole package (both its
`range` and `peer` edits together), and the rest of the run proceeds — one
bad package cannot block an otherwise-good upgrade. `runUpgrade`
(`package/src/cli/commands/upgrade.ts:243-380`), the non-interactive core
invoked by `--yes`, is strict instead: it fails hard (non-zero exit,
nothing written) on any warning — a peer-strategy incompatibility from
`derivePeerRange` or a planned edit no published version satisfies
(`commands/upgrade.ts:235-239`).[^upgrade-command] The asymmetry is
deliberate: an interactive user sees a warning and can go fix the config; a
`--yes` run is unattended (CI), where a warning scrolling past unread is
how a broken range reaches a published artifact
(`commands/upgrade.ts:235-239`).[^upgrade-command] `--yes` continues to
never apply a major regardless of warnings, which is a separate, unrelated
invariant (see the major-bumps-interactive-only decision).

This same strictness reasoning also governs the `unresolved` package
family (registry could not resolve a package name at all, distinct from a
package with a real publish history that simply has nothing new enough to
offer): `runUpgrade` fails the run outright on any unresolved package,
writing nothing at all, since an unattended run has nobody to read a
warning and half-applying a config with a name that will never resolve is
worse than applying none of it
(`commands/upgrade.ts:272-277`).[^upgrade-command]

## Alternatives rejected

- **Make interactive mode fail hard too, for consistency with `--yes`.**
  Rejected: an interactive user is present to see and react to a warning;
  failing the whole run over one bad package would block every other
  package's legitimate upgrade for a problem the user could otherwise
  resolve or ignore item-by-item.
- **Make `--yes` lenient and merely report warnings without failing.**
  Rejected: `--yes` is the unattended/CI path; a warning that only prints
  and does not fail the run is a warning nobody reads before a broken
  range reaches a published artifact.
- **Reject at per-edit granularity instead of per-package.** Rejected:
  writing one half of a `range`/`peer` pair (say, an accepted range bump
  next to a rejected, stale peer) leaves the file internally
  inconsistent — the peer would no longer match what the strategy derives
  from the newly-written range — and would cause permanent re-reported
  drift on every subsequent run (`validate.ts:43-51`).[^validate]

## Consequences

- Any new warning class introduced anywhere in the pipeline (peer
  derivation, validation, resolution) must be threaded to both the
  interactive summary and the `--yes` strictness check in
  `runUpgrade`, or the two modes will silently disagree about what counts
  as fatal.
- A `strategy` package's `range` and `peer` edits must always be produced
  and evaluated as a pair through `validateEdits`; splitting them anywhere
  in the pipeline breaks the atomicity this decision depends on.
- `--yes`'s strictness and its never-a-major rule are independent
  invariants that both hold simultaneously — a warning failing the run
  does not relax the major-bump restriction, and vice versa.

[^validate]: validate
[^upgrade-command]: upgrade-command
