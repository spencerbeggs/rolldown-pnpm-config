---
type: Glossary
title: strategy
description: A pure (base, local, ctx) => { merged, divergences } function that only detects divergence — and the unrelated PeerStrategy CLI concept that shares the word.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: strategy-table
    resource: ../../package/src/runtime/strategies/table.ts
  - id: catalogs-peer-strategy
    resource: ../../package/src/catalogs.ts
---

# strategy

In the runtime, a strategy is a pure function of shape
`(base, local, ctx) => { merged, divergences }`, registered by name in
`STRATEGY_TABLE`[^strategy-table]. A strategy only DETECTS divergence
between the managed `base` value and the consumer's `local` value and
produces a merged result; it never decides what to do about a
divergence — that is [enforcement](enforcement.md)'s job, applied
afterward by the caller. See
[detection-separated-from-response](../decisions/detection-separated-from-response.md)
for why the two are split.

This is a distinct concept from `PeerStrategy`
(`"lock" | "lock-minor" | "interop"`) in `package/src/catalogs.ts`[^catalogs-peer-strategy],
which is CLI-only metadata governing how the `upgrade` CLI recomputes a
materialized `peer` range when a catalog `range` is bumped — the runtime
ignores it entirely. The two "strategy" concepts share only the word;
this collision is exactly why the term needs its own entry.
