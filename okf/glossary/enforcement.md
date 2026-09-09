---
type: Glossary
title: enforcement
description: What is done about a divergence — warn routes to a console box by kind, error throws EnforcementError, absent is silent.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: enforcement-impl
    resource: ../../package/src/runtime/enforcement.ts
---

# enforcement

Enforcement is the response to a [divergence](divergence.md) a
[strategy](strategy.md) detected, applied by `applyEnforcement` after the
strategy runs[^enforcement-impl]. Three values:

- `warn` — the divergence is partitioned into an override or security
  bucket by its `kind` and later rendered as a console box; the merged
  value still wins[^enforcement-impl].
- `error` — `applyEnforcement` throws `EnforcementError`, a plain `Error`
  subclass (not an Effect type) meant to propagate and fail the
  install[^enforcement-impl].
- absent (no divergences, or an enforcement value that matches neither
  `warn` nor `error`) — silent; the merged value is used with no
  reporting[^enforcement-impl].

See [detection-separated-from-response](../decisions/detection-separated-from-response.md)
for why detection ([strategy](strategy.md)) and response (enforcement)
are two separate steps.
