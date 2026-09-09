---
type: Decision
title: Default override preservation
description: "Every export run preserves file:/link:/workspace:/portal: override entries by default, making the safe behavior opt-out rather than opt-in."
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: effective-ts
    resource: package/src/cli/effective.ts
  - id: local-merge-ts
    resource: package/src/cli/local-merge.ts
tags:
  - architecture
---

# Default override preservation

## Context

`overrides` is a managed top-level field in the exported
`pnpm-workspace.yaml`, so a naive overlay would replace it wholesale on
every write. An existing `overrides` entry such as
`rolldown-pnpm-config: file:/…/pkg` — a local pnpm link a developer relies
on — would then be silently dropped the next time `export` ran, even
though nothing in the plugin's own config asked for that entry to be
removed.

## Decision

The default-preserve step for `overrides` runs on every `export`, not only
when `local.overrides` is explicitly configured, making the safe behavior
opt-out rather than opt-in. `effectiveManaged`
(`package/src/cli/effective.ts:21-38`) builds its working field set as
`new Set(["overrides", ...Object.keys(local ?? {})])` (`effective.ts:31`)
— `overrides` is unconditionally included even when `local` is `undefined`
or omits it entirely, so the directive step always runs for that field.

`applyLocalDirective` (`package/src/cli/local-merge.ts:48-82`) applies the
preserve step for `field === "overrides"` after any value/strategy step
(`local-merge.ts:69-79`): it copies back any entry from `parsed` whose
value string starts with `<proto>:` for `proto` in the preserve list,
defaulting to `DEFAULT_PRESERVE = ["file", "link", "workspace", "portal"]`
(`local-merge.ts:2`) when the directive sets no explicit `preserve`. An
explicit `preserve` list on `local.overrides` replaces the default rather
than adding to it (`local-merge.ts:70`).

Because `effectiveManaged` always includes `overrides` in its field set,
this preserve step is not a special case triggered only by author
configuration — it is unconditional, and the value/strategy steps of
`applyLocalDirective` are simply no-ops when no directive is present,
leaving managed `overrides` intact before the preserve step runs.

## Alternatives rejected

- **Require authors to opt in via `local.overrides: { preserve: [...] }}`
  for every project.** Rejected because the failure mode — silent deletion
  of a working local link override — is severe and easy to miss until a
  consumer's local dependency link breaks; the cost of preserving by
  default (copying back a handful of protocol-prefixed entries) is low and
  the desired behavior in the overwhelming majority of repos.
- **Preserve every override protocol, not just `file:`/`link:`/`workspace:`/`portal:`.**
  Rejected for the default list: other protocols such as `git*` are opt-in
  via an explicit `preserve` list on `local.overrides`
  (`local-merge.ts:70`), since preserving arbitrary override protocols by
  default is a broader behavior change than fixing the specific data-loss
  case this decision addresses.

## Consequences

- A bare `export` with no `local` configuration keeps existing
  `file:`/`link:`/`workspace:`/`portal:` override entries instead of
  deleting them.
- `preserve` is overrides-only; array-typed managed fields such as
  `publicHoistPattern` use `strategy`/`excludeByRepo` instead
  (`effective.ts:5-12`), since a "preserve" concept keyed on a value-string
  prefix does not generalize to arrays the same way.
- Any future managed field that can hold local, protocol-prefixed
  developer overrides should be evaluated against this same
  default-preserve precedent before deciding whether it needs opt-in or
  opt-out protection.
