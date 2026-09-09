---
type: Limitation
title: A prerelease workspace next version cannot be planned
description: plan's stable-only candidate filter drops a workspace-sourced entry whose next workspace version is a prerelease, unless the entry's current range is itself a prerelease on the same track.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: plan-ts
    resource: ../../package/src/cli/plan.ts
  - id: upgrade-command-ts
    resource: ../../package/src/cli/commands/upgrade.ts
---

# A prerelease workspace next version cannot be planned

## Condition

A catalog entry declares `source: "workspace"`, so its candidate takes the
sole non-keep entry `planEntry` computes rather than the in-range pick
(`package/src/cli/commands/upgrade.ts:357-365`).[^upgrade-command-ts] That
workspace-sourced next version is itself a prerelease.

## Symptom

`planEntry`'s candidate list is stable-only by default: a published version
is only parsed into a candidate when `sv.isStable`, or — the one exception —
when it is on the same named prerelease track as the entry's own current
range (`onTrack`, `package/src/cli/plan.ts:30-39`).[^plan-ts] A stable entry
never sees a prerelease candidate.[^plan-ts] A workspace-sourced entry whose
next version is a prerelease, and whose current range is not itself on that
same track, therefore produces no matching candidate in `planEntry`'s parsed
list at all — there is nothing for
`commands/upgrade.ts`'s `candidates.find((c) => c.kind !== "keep")` to
find[^upgrade-command-ts] — so the entry cannot advance onto that
prerelease next release through `--yes` or the interactive table until the
workspace version itself goes stable.

## Why it is acceptable

Prerelease filtering exists so an ordinary upgrade never proposes an
unstable version by surprise. Extending the same-track exception to every
workspace-sourced entry indiscriminately would mean any workspace package
that cuts a prerelease automatically becomes proposable to every consumer
catalog entry, defeating the purpose of the filter for the one source
(`workspace`) that is otherwise already exempt from the never-cross-a-range
major-bump rule for the same reason: a workspace version is this repo's own
declared next release, not an external registry surprise
(`upgrade.ts:357-361`; see
[major bumps are interactive-only](../decisions/major-bumps-interactive-only.md)).[^upgrade-command-ts]
The entry is not stuck permanently — it resumes normal candidate
consideration the moment the workspace's next version is stable, or the
moment its own current range moves onto that prerelease track.

## Fix

A fix would require `planEntry` to treat `entry.source === "workspace"` as
its own exception to the `isStable || onTrack(sv)` filter
(`plan.ts:39`)[^plan-ts] — the same way `commands/upgrade.ts` already
special-cases `entry.source === "workspace"` to bypass the
never-cross-a-range rule[^upgrade-command-ts] — trusting the workspace's own
declared next version as intent, rather than gating it behind the
current-range-track check that exists for registry-sourced entries.

This limitation bounds the promise described in
[upgrade command](../interfaces/upgrade-command.md).

[^plan-ts]: plan-ts
[^upgrade-command-ts]: upgrade-command-ts
