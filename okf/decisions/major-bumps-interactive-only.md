---
type: Decision
title: Major bumps are interactive-only
description: "--yes resolves within range only; there is deliberately no flag that applies a major version bump automatically, with one exception for workspace-sourced entries."
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: plan
    resource: package/src/cli/plan.ts
  - id: walk-reducer
    resource: package/src/cli/walk-reducer.ts
  - id: upgrade-command
    resource: package/src/cli/commands/upgrade.ts
  - id: catalogs
    resource: package/src/catalogs.ts
tags:
  - architecture
---

# Major bumps are interactive-only

## Context

`planEntry` (`package/src/cli/plan.ts:19-111`) computes several candidate
tiers per catalog entry: `in-range` (latest satisfying the current caret),
`minor` (latest within the current major line but beyond the caret),
`latest` (latest overall, possibly a major jump), and `keep`.[^plan] A
non-interactive run needs a deterministic rule for which of these it may
apply without a human present to absorb the consequences of a breaking
upgrade.

## Decision

The non-interactive core (`runUpgrade`, `package/src/cli/commands/upgrade.ts:243-380`)
selects only the `in-range` candidate, never `minor` or `latest` — crossing
a major requires running interactively and deliberately choosing
it.[^upgrade-command] In the interactive table, `initTable`
(`package/src/cli/walk-reducer.ts:52-55`) preselects `picks[i] = 0` on
every row, and `displayCandidates` (`walk-reducer.ts:39-41`) always sorts
`keep` to index 0, so the default state of the whole table is a no-op and
a major can only be applied by a user deliberately moving the cursor onto
its bubble.[^walk-reducer] `--yes` continues to never apply a major
regardless of any warnings encountered during
validation.[^upgrade-command]

**Workspace-sourced exception.** A catalog entry that declares
`source: "workspace"` (`VersionSource`, `package/src/catalogs.ts:20`)
resolves its version from the local workspace's next release version
instead of the registry, and sits outside the never-cross-a-range rule:
`runUpgrade` takes a workspace entry's sole non-keep candidate even when
it falls outside the current range, because a 0.x caret routinely
excludes the workspace's own next minor (`^0.2.0` does not contain
`0.3.0`), and a strict in-range-only rule would select nothing forever
(`commands/upgrade.ts:356-365`).[^catalogs][^upgrade-command] The rule
protects against a surprise *registry* major; a workspace version is this
repo's own declared next release, not an external surprise, so the guard
does not apply to it (`commands/upgrade.ts:357-361`).[^upgrade-command]

## Alternatives rejected

- **Add a flag (e.g. `--yes-major`) that applies a major automatically.**
  Rejected: a major bump is definitionally a breaking-change signal; the
  whole point of gating it behind interactive choice is that an unattended
  run should never cross that line without a human looking at what
  changed. The design deliberately withholds this escape hatch.
- **Apply the never-cross-a-range rule uniformly, including to
  workspace-sourced entries.** Rejected: it would make workspace-sourced
  catalog entries with a caret range permanently stuck below their own
  next release, since a workspace's own version bump is the repo's
  intent, not an external risk the rule is meant to guard against.

## Consequences

- Any new non-interactive resolution path added to the CLI must uphold
  "never a major" as a hard invariant, not merely a default.
- A workspace-sourced entry's non-interactive candidate selection differs
  from every other entry's; code touching that selection must check
  `CatalogEntry.source` before applying the general
  in-range-only rule.
- The interactive table's preselected-keep design (`initTable`,
  `displayCandidates`) is load-bearing for this decision: removing that
  default would make an accidental major application possible without
  deliberate cursor movement.

[^plan]: plan
[^walk-reducer]: walk-reducer
[^upgrade-command]: upgrade-command
[^catalogs]: catalogs
