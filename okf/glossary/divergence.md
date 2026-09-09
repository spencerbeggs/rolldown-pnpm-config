---
type: Glossary
title: divergence
description: A classified disagreement between the managed value and the consumer's local value, carrying a kind.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: enforcement-impl
    resource: ../../package/src/runtime/enforcement.ts
---

# divergence

A divergence is the record a [strategy](strategy.md) emits when the
consumer's local `pnpm-workspace.yaml` disagrees with the managed
[base](base.md) value for a field. `applyEnforcement` reads a
divergence's `kind` to decide which bucket to sort it into (`security`
routes to the security list, anything else to the override
list)[^enforcement-impl] and, on `error` enforcement, joins the
divergences' `setting` names into the thrown `EnforcementError`
message[^enforcement-impl].

The field names are `managedValue` and `localValue` — renamed from the
Silk-era `silkValue`/`childValue`; the current names describe the two
sides directly (the managed/plugin-declared value vs. the consumer's
local value) rather than referring to a predecessor project or a
parent/child relationship.
