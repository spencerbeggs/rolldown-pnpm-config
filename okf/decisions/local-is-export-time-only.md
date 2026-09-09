---
type: Decision
title: "local is post-freeze, export-time only"
description: "Per-repo local adjustments belong only in the export step and never in freeze, base, or the bundled runtime artifact, since the pnpmfile must be identical for every consumer of the plugin."
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: define-plugin-ts
    resource: package/src/define-plugin.ts
  - id: effective-ts
    resource: package/src/cli/effective.ts
  - id: freeze-ts
    resource: package/src/plugin/freeze.ts
tags:
  - architecture
---

# `local` is post-freeze, export-time only

## Context

`rolldown-pnpm-config` ships one bundled runtime pnpmfile per plugin
author, shared by every consuming repo that installs it as a config
dependency. A plugin author sometimes needs a per-repo local adjustment —
for example a locally patched-dependency path, or preserving a `file:`
link — that should not change what every other consumer of the same
plugin receives. `local.<field>` on `PluginConfig` is the authoring
mechanism for that adjustment, and it needed a hard boundary stating when
in the pipeline it is allowed to take effect.

An earlier implementation applied `local` divergence via a pre-freeze
shallow-replace module (`local-overlay.ts`) that could only replace a
field wholesale; that module no longer exists in the source tree.

## Decision

`local` is applied post-freeze, export-time only: it does not affect
`freeze`'s output or the runtime pnpmfile. `freeze`
(`package/src/plugin/freeze.ts:56`) validates a plugin author's declared
config and yields `{ base, manifest, name }` from the config alone —
`local` plays no part in that computation. `effectiveManaged`
(`package/src/cli/effective.ts:21-38`) applies per-field local directives
working from `managed`, the already-frozen and filtered config, entirely
downstream of `freeze`. `vanillaManaged` (`effective.ts:46-54`) applies
only `excludeByRepo` and no local directives at all, and is the
"fresh-consumer" base used by the Simulated preview view specifically so a
plugin author can see what a consumer with no local overrides would get.

The authoring type driving this is `LocalDirective<T>`
(`package/src/define-plugin.ts:20`) — `{ preserve?, value?, strategy? }`,
all keys optional, documented as "applied only by
`rolldown-pnpm-config export`" (`define-plugin.ts:12`) — where the `local`
field of `PluginConfig` accepts either a raw value or a `LocalDirective`
for each key. This replaced the previous "always overwrite" semantics of
the removed pre-freeze `local-overlay.ts` shallow-replace with a directive
form capable of union, difference, and merge, but the export-time-only
boundary predates and is independent of that richer-directive change.

## Alternatives rejected

- **Let `local` influence `freeze` or its output.** Rejected because the
  runtime pnpmfile must be identical for every consumer of the plugin; if
  `local` reached into `freeze`, the bundled artifact would no longer be
  the same for every installer, breaking the config-dependency
  distribution model.
- **Keep the pre-freeze `local-overlay.ts` shallow-replace.** Rejected
  because it supported only whole-value replacement, could not express
  union/difference/merge semantics, and lived before `freeze` rather than
  after it — conflating "what the plugin declares" with "what this one
  repo wants differently."

## Consequences

- Any new `local`-affecting behavior must be implemented in the export
  pipeline (`effectiveManaged`/`applyLocalDirective` and their callers),
  never inside `freeze` or `package/src/runtime/**`.
- The Simulated preview view can show a plugin author the truly
  local-override-free consumer experience via `vanillaManaged`, because
  `local` structurally cannot leak into that computation.
- A future contributor reaching for `local-overlay.ts` will not find it —
  its responsibility now lives in `cli/local-merge.ts` and
  `cli/effective.ts`.
- Because `local` cannot affect `freeze`'s output, testing `freeze` never
  needs to account for per-repo local configuration; local-directive tests
  belong entirely to the export/preview pipeline.
