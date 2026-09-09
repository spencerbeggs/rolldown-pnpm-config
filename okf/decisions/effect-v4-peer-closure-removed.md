---
type: Decision
title: Effect v4 collapses the declared peer closure
description: The v3-era satellite peer-closure workaround in package/package.json is obsolete under Effect v4 and was removed.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: package-json
    resource: package/package.json
  - id: bin
    resource: package/src/cli/bin.ts
tags:
  - architecture
---

# Effect v4 collapses the declared peer closure

## Context

Under Effect v3, `package/package.json` declared the full non-optional peer
closure of `@effect/platform-node` and `@effect/cli` — `@effect/cluster`,
`@effect/experimental`, `@effect/printer`, `@effect/printer-ansi`,
`@effect/rpc`, `@effect/sql`, `@effect/typeclass`, `@effect/workflow` — as
regular `dependencies`, even though nothing in `package/src/` imported them.
Left undeclared, pnpm's `autoInstallPeers` would resolve those peers inside
every consuming workspace and pollute consumer lockfiles; declaring them
pinned resolution to this package's own subtree (`savvy-web/systems#228`).
None of those v3 satellite names remain anywhere in the current
`package/package.json`.[^package-json]

## Decision

Under Effect v4 that workaround is obsolete, and the satellite closure was
removed. v4 folds the satellite packages into `effect` itself — the CLI now
lives at `effect/unstable/cli`, process spawning at `effect/unstable/process`
— and `@effect/platform-node` v4 peers only on `effect`. There is no closure
left to leak, so `autoInstallPeers` has nothing to resolve into a consumer's
lockfile. The build-time/CLI dependency surface declared today is just
`effect` (`catalog:effect`) plus `@effect/platform-node` (also
`catalog:effect`); nothing else from the Effect org appears in
`dependencies`.[^package-json] Both are genuinely imported, unlike the
removed v3 satellites: `@effect/platform-node`'s `NodeRuntime` and
`NodeServices` are imported directly in `package/src/cli/bin.ts`.[^bin]

This is a build-time/CLI manifest concern only; the shipped pnpmfile is
zero-dependency either way and is unaffected by this change.

## Alternatives rejected

- **Keep the v3 satellite closure declared "just in case."** Rejected: the
  closure existed solely to give `autoInstallPeers` somewhere safe to
  resolve a peer it would otherwise dump into a consumer's lockfile; under
  v4 there is no such peer left, so keeping the closure would only
  reintroduce unused dependencies with no matching import.
- **Prune the two remaining v4 dependencies (`effect`, `@effect/platform-node`)
  as apparently unused, per the old "do not prune as unused" guidance.**
  Rejected: that guidance was written for the v3 satellites, which really
  were unimported placeholders. The current two dependencies are both
  genuinely imported — `@effect/platform-node` at
  `package/src/cli/bin.ts`[^bin] — so the historical guidance does not
  transfer and must not be read as still applying.

## Consequences

- Do not re-add the v3 satellite packages
  (`@effect/cluster`, `@effect/experimental`, `@effect/printer`,
  `@effect/printer-ansi`, `@effect/rpc`, `@effect/sql`, `@effect/typeclass`,
  `@effect/workflow`) to `package/package.json` — under v4 there is no peer
  closure for them to pin, and they would sit unimported.
- Do not read the historical "do not prune as unused" guidance as still
  applying to `effect` or `@effect/platform-node` — both are genuinely
  imported under v4, so ordinary unused-dependency judgment applies to them
  like any other dependency.
- Any future addition to the Effect-org dependency surface should be
  justified by an actual import in `package/src/`, not by a peer-pinning
  concern — the peer-pollution problem this closure solved no longer exists
  under v4.

[^package-json]: package-json
[^bin]: bin
