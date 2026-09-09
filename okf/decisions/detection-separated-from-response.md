---
type: Decision
title: Detection separated from response
description: A strategy only detects and classifies divergences; the response (warn/error/silent) lives entirely in applyEnforcement.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: types
    resource: package/src/runtime/types.ts
  - id: enforcement
    resource: package/src/runtime/enforcement.ts
  - id: runtime-index
    resource: package/src/runtime/index.ts
---

# Detection separated from response

## Context

The runtime merges a plugin author's `base` config with a consuming repo's
`localConfig` for every managed field, and needs to decide, per divergence,
whether to warn, error, or stay silent. That policy varies by field
(`enforcement`) and by divergence `kind` (`"override" | "security"`,
`package/src/runtime/types.ts:33`),[^types] and it needed a shape that lets
one merge algorithm serve every enforcement level.

## Decision

A `Strategy` is a pure `(base: unknown, local: unknown, ctx: RuntimeCtx) =>
StrategyResult` (`package/src/runtime/types.ts:62`).[^types] Strategies only
*detect* divergences and classify each by `kind`; they never decide what to
do about one.[^enforcement] The response lives in `applyEnforcement`, which
partitions a strategy's divergences into override and security buckets and
throws `EnforcementError` when `enforcement === "error"` and at least one
divergence exists (`package/src/runtime/enforcement.ts:25-38`); `absent`
falls through both branches silently. This split lets the same strategy
serve every enforcement level.[^enforcement]

The runtime deliberately has no catch-and-fall-back-to-local guard: an
`error`-enforced divergence must propagate and fail the install. If a
swallow-guard is ever added it must rethrow `EnforcementError` rather than
fall back to the local value — documented inline in the `@remarks` above
`createHooks` (`package/src/runtime/index.ts:13-18`).[^runtime-index]

## Alternatives rejected

- **Enforcement policy baked into each strategy.** Rejected because it
  would require a separate strategy implementation (or a branch inside
  every strategy) per enforcement level, instead of one detection algorithm
  reused across `absent`, `warn`, and `error`.
- **A catch-and-fall-back-to-local guard around enforcement.** Rejected
  because it would let an `error`-enforced divergence silently degrade to
  the local value instead of failing the install, defeating the purpose of
  `error` enforcement.

## Consequences

- The same strategy implementation serves every enforcement level; adding a
  new enforcement policy never touches strategy code, only
  `applyEnforcement`.[^enforcement]
- `EnforcementError` must propagate uncaught through the runtime; any
  future code that catches broadly around the merge loop must rethrow
  `EnforcementError` rather than swallow it and fall back to local, or it
  silently defeats `error`-level enforcement.[^runtime-index]

[^types]: types
[^enforcement]: enforcement
[^runtime-index]: runtime-index
