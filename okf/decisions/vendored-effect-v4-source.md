---
type: Decision
title: Vendored v4 source as the API authority
description: Effect v4 source is vendored read-only under .repos/, pinned to the version catalog:effect resolves, and consulted instead of the lagging published docs.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: repos-config
    resource: .repos/config.json
  - id: gitmodules
    resource: .gitmodules
  - id: lockfile
    resource: pnpm-lock.yaml
tags:
  - architecture
---

# Vendored v4 source as the API authority

## Context

Effect v4 is pre-release and moving on the release-candidate line, and its
published docs can lag the code — a v4 signature or module shape recalled
from memory or an older cached doc may already be wrong. The build-time/CLI
dependency surface resolves `effect` from `catalog:effect`.

## Decision

The Effect v4 source is vendored read-only as a git submodule at
`.repos/effect` (`.gitmodules`),[^gitmodules] pinned via `.repos/config.json`
to the exact `effect` version tag the `ref` field names.[^repos-config] The
vendored source is treated as the authority for v4 API shapes during the
pre-release period and is consulted in preference to memory of an older
Effect line or to documentation that may not have caught up yet.

The pin is not a fixed version number to be repeated indefinitely: the rule
is that it tracks whatever version `catalog:effect` currently resolves to,
and is re-pinned when that changes. At the time of writing both agree:
`.repos/config.json` pins `ref: "effect@4.0.0-rc.115"`[^repos-config] and
`pnpm-lock.yaml` resolves `effect` to `4.0.0-rc.115`.[^lockfile] The two can
drift apart in the ordinary course of dependency bumps (the pin sat at
`rc.109` for one cycle while the lockfile had moved to `rc.112`); such a gap
is a signal that the pin is due for a refresh, not evidence that vendoring
the source was the wrong call.

## Alternatives rejected

- **Rely on the published Effect v4 documentation.** Rejected: pre-release
  docs can lag the code, so trusting them risks acting on a signature that
  has already changed by the time it is read.
- **Rely on memory of Effect's API.** Rejected for the same reason,
  compounded by the fact that most available training and cached material
  describes Effect v3, a materially different API shape from v4.
- **Vendor a fixed version and never re-pin it.** Rejected: a fixed vendored
  version would silently drift out of sync with whatever version the catalog
  actually resolves, reintroducing the same staleness problem vendoring was
  meant to solve — as the `rc.109`/`rc.112` gap that opened during one bump
  cycle demonstrated in practice.[^repos-config][^lockfile]

## Consequences

- Before trusting an answer about a v4 API shape, check that the vendored
  pin's `ref` in `.repos/config.json` matches the `effect` version actually
  resolved in `pnpm-lock.yaml` — on disagreement, the lockfile wins, and the
  vendored pin should be refreshed.
- Do not hard-code a specific pinned version number into guidance or
  documentation as if it were permanent; state the tracking rule instead,
  since the pin is expected to move as `catalog:effect` is bumped.
- The vendored source at `.repos/effect` is read-only and exists purely as a
  lookup authority for agents and contributors, not as a build input.

[^repos-config]: repos-config
[^gitmodules]: gitmodules
[^lockfile]: lockfile
