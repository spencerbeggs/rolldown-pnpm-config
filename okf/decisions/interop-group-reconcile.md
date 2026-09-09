---
type: Decision
title: Interop strategy reconciles the group, not one package
description: The "interop" peer strategy reconciles a whole catalog group against its members' cross-peers, pinning at each member's ceiling and downgrading only dependents; the interactive and --yes paths diverge on how conflicts surface.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: interop
    resource: package/src/cli/interop.ts
  - id: interop-live
    resource: package/src/cli/interop-live.ts
tags:
  - architecture
  - performance
---

# Interop strategy reconciles the group, not one package

## Context

`"lock"` and `"lock-minor"` derive one package's peer purely from its own
chosen range, offline. That per-package model cannot express the `@effect`
ecosystem's shape, where `effect`, `@effect/cli`, `@effect/platform`, and
others each constrain one another through `peerDependencies` — bumping one
member in isolation can leave the group internally inconsistent. `interop`
generalizes an older `pnpm-plugin-silk` helper that hardcoded the
`effect`/`@effect/*` filter; group membership (every package in one
catalog marked `strategy: "interop"`) replaces that hardcoded filter.

## Decision

`interop` is a per-catalog group reconcile, not a per-package derivation.
`resolveGroup` (`package/src/cli/interop.ts:125-180`) pins each member at
its chosen version (the ceiling) and downgrades only dependents to
satisfy in-group peers: it never raises a ceiling and never downgrades a
peer target, so the dependency-only member (`effect` core, which has no
in-group peerDeps) is the de-facto anchor without being named
explicitly.[^interop] A member with no satisfiable version at or below its
pick becomes an `InteropConflict`, left at the user's pick
(`interop.ts:167-177`).[^interop] `deriveFloors`
(`interop.ts:33-67`) then sets each member's peer to `^<lowest floor any
in-group member declares for it>`, falling back to `^<resolved version>`
when nothing peer-depends on it.[^interop] The caret cap is deliberate:
standard semver caret semantics stop a surprise next major (e.g.
`effect@4`) from satisfying a peer meant for the 3.x line.

**The two paths diverge on when and how conflicts surface.** The
`--yes`/CI path runs `runInterop` (`interop.ts:227-282`) once and reports
any residual conflict; its fetching is lazy, prefetching only each
member's ceiling version concurrently
(`INTEROP_PEER_CONCURRENCY = 8`, `interop.ts:6`) to warm the common case
where every ceiling is mutually compatible, fetching lower versions on
demand inside the downgrade search via the memoized `fetchPeer`
(`interop.ts:254-279`).[^interop] This design deliberately avoids an
eager prefetch of every candidate version at or below the ceiling —
prefetching every candidate for a real `@effect` group (dozens of members
with hundreds of published versions each) would mean thousands of
`pnpm view` calls, reducing the total call count instead to
`O(N + |downgraded members| × depth)` (`interop.ts:207-218`).[^interop]
The interactive path instead recomputes live in the table:
`buildGroupModel` (`package/src/cli/interop-live.ts:113-155`) pre-fetches
every candidate version's in-group peerDeps up front (concurrently, the
same `INTEROP_PEER_CONCURRENCY` bound) and pre-parses every version and
range, so `computeGroupPeers` (`interop-live.ts:54-103`) can recompute
each member's floor and conflict synchronously on every keystroke as picks
change — the table itself is the reconcile.[^interop-live] The write path
honors the final picks plus those live-derived floors directly, with no
post-walk downgrade or re-prompt, and reports whatever conflicts remain.
The earlier bounded interactive re-entry loop (`reentryCandidates`,
`interop.ts:293-316`, which re-ran `runInterop` per round until the group
stabilized) is no longer invoked from the interactive path — it now runs,
if at all, only along the `--yes`/CI path's single-pass
reconcile.[^interop]

## Alternatives rejected

- **Derive each member's peer independently, per package, like
  `lock`/`lock-minor`.** Rejected: it cannot express cross-member
  constraints at all — the entire reason `interop` exists is that members
  constrain each other, which a per-package derivation has no way to see.
- **Raise a ceiling or downgrade a peer target to reconcile a
  conflict.** Rejected: selections are ceilings the user chose; raising
  one would silently apply a version the user never picked, and
  downgrading a peer target would make the "anchor" member move under
  pressure from its dependents rather than the reverse
  (`interop.ts:119-121`).[^interop]
- **Keep the original bounded interactive re-entry loop
  (`reentryCandidates`) instead of live recomputation.** Rejected in favor
  of `interop-live.ts`: re-entering the walk per round to re-run the batch
  reconcile is strictly more round-trips and more UI complexity than
  recomputing synchronously from pre-fetched, pre-parsed data as the
  cursor moves.
- **Eagerly prefetch every candidate version ≤ ceiling for every member
  on the `--yes` path.** Rejected: measured against a real `@effect` group
  this meant thousands of `pnpm view` calls; lazy ceiling-first prefetch
  with on-demand fetching during the downgrade search keeps the common
  case (all ceilings compatible) cheap (`interop.ts:212-218`).[^interop]

## Consequences

- The two interop code paths (`interop.ts`'s batch reconcile and
  `interop-live.ts`'s synchronous recompute) must be kept in agreement on
  what "resolved" and "conflict" mean, even though they fetch and iterate
  differently — a divergence here would make `--yes` and the interactive
  table disagree about the same catalog.
- `INTEROP_PEER_CONCURRENCY` (8) is a shared, load-bearing tuning constant
  between both paths (`interop.ts:6`, imported into
  `interop-live.ts:4`); changing it changes both fetch profiles at
  once.[^interop][^interop-live]
- Any future group-reconcile strategy that needs interactive live feedback
  should model itself on `interop-live.ts`'s pre-fetch-then-recompute
  shape rather than reintroducing a re-entry loop.
- Group membership is scoped per catalog; separating an ecosystem into
  narrower catalogs (e.g. `react18` vs `react19`) is the intended way to
  create separate interop groups.

[^interop]: interop
[^interop-live]: interop-live
