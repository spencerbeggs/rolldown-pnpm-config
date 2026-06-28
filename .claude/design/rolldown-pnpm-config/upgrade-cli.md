---
status: current
module: rolldown-pnpm-config
category: architecture
created: 2026-06-27
updated: 2026-06-28
last-synced: 2026-06-28
completeness: 92
related:
  - architecture.md
  - settings-coverage.md
  - specs/2026-06-26-catalog-upgrade-cli-design.md
  - specs/2026-06-27-interop-peer-strategy-design.md
dependencies:
  - architecture.md
---

# rolldown-pnpm-config - upgrade CLI

The `rolldown-pnpm-config upgrade` command that rewrites catalog version ranges in a config file in place, statically and surgically, with no execution of the config.

## Table of contents

1. [Overview](#overview)
2. [Current state](#current-state)
3. [Pipeline](#pipeline)
4. [Rationale](#rationale)
5. [Peer handling](#peer-handling)
6. [Command surface](#command-surface)
7. [Load-bearing types](#load-bearing-types)
8. [Related documentation](#related-documentation)

## Overview

`upgrade` keeps the catalog version ranges declared in a `PnpmConfigPlugin({...})` call current. It reads the config source, finds each catalog version literal, resolves available versions from the registry, lets the author choose per package (or applies latest-in-range non-interactively) and rewrites the version ranges in place at their byte spans. The versions stay visible in source; there is no separate generated manifest to reconcile.

This replaces the old `pnpm-plugin-silk` flow (track catalog deps in the root `package.json`, run `pnpm up -i -r`, regenerate). The CLI is a separate developer-facing subsystem from the build-to-runtime engine documented in [architecture.md](architecture.md); they share only the authoring shape (`PnpmConfigPlugin`'s inline `catalogs`) that `upgrade` reads and rewrites.

It lives entirely under `package/src/cli/` and is published via the `bin` entry `rolldown-pnpm-config` (`package/src/cli/bin.ts`). Reference this document when changing the upgrade pipeline, the peer recompute/drift/materialize behavior or the static discovery and rewrite mechanics.

## Current state

Built across phases B1 (non-interactive core), B2 (interactive Ink walk + drift + dry-run + catalog filter) and B3 (peer materialization + config autodetect), then extended on `feat/peer-interop` with the `interop` catalog peer strategy (`interop.ts`) and a `minimumReleaseAge` gate on all version resolution (`release-age.ts`). The implementation records are the dated plan docs under `plans/`; the interop/release-age design is recorded in [the interop peer strategy spec](specs/2026-06-27-interop-peer-strategy-design.md). The pure units (`discover`, `plan`, `peer-range`, `drift`, `walk-plan`, `walk-reducer`, `edits`, `summary`, `select-file`, `interop`, `release-age`) are unit-tested; the Ink render shell, the `pnpm`-shelling resolver and the `@effect/cli` wiring are integration-tested under `package/__test__/cli/`.

## Pipeline

The command (`package/src/cli/commands/upgrade.ts`) wires single-purpose units in sequence. Data crosses each boundary as plain values.

`discover` (`discover.ts`) parses the source with `oxc-parser`, finds the one `PnpmConfigPlugin(...)` call and walks `catalogs.<name>.packages`. Each package whose range is a simple-operator string literal becomes a `CatalogEntry` carrying byte-offset spans for the range literal and any `peer` literal. Anything non-literal or with a complex multi-comparator range is returned in `skipped`, never rewritten.

`resolve` (`resolve.ts`) is the only Effect service: `RegistryResolver` shells out to `pnpm view <pkg> versions --json`, reusing the user's `.npmrc`, scoped registries and auth tokens. It also exposes `times` (`pnpm view <pkg> time --json`, publish dates feeding the release-age gate), `peerDependencies` (`pnpm view <pkg>@<version> peerDependencies --json`, per-version, feeding interop) and `pnpmConfig` (`pnpm config get <key>`, feeding the gate). Per-package failures are swallowed to a skip, never aborting the run.

The release-age gate (`release-age.ts`) filters every candidate list before `plan` or interop see it, so no path can propose a version pnpm would refuse to install. `computeGate` combines two sources into one `ReleaseAgeGate`: the `minimumReleaseAge`/`minimumReleaseAgeExclude` fields statically read from the `PnpmConfigPlugin(...)` config and the pnpm-resolved values from `pnpm config get`. The age is the strictest (`max(config, pnpm)` minutes) and the exempt set is the widest (`union(config, pnpm)` patterns). `resolveGatedVersions` then fetches each package's versions plus `times` and drops any version younger than `now − age` (and any with no publish timestamp), unless the package matches the exempt set; an age of 0 is a no-op that skips the `times` fetch.

`plan` (`plan.ts`) computes the candidate list per entry with `semver-effect`: latest-in-range (when newer than current), latest-overall stable (when newer than the in-range pick, possibly a major jump) and keep. Prereleases are filtered out. When the entry carries a non-interop `strategy`, each non-keep candidate gets a recomputed `peerRange`; interop entries defer the peer to the group pass below.

The choice layer differs by mode. Non-interactive (`--yes`) takes latest-in-range directly and never the major. Interactive builds `WalkItem`s (`walk-plan.ts`) and runs the Ink `Walk` (`ui/Walk.ts`) driven by the pure `walk-reducer.ts` state machine, collecting `Decision`s through the `runWalk` bridge (`ui/run-walk.ts`).

Interop reconcile (`interop.ts`) runs after the per-entry choices and before edits. Interop entries are grouped by catalog and each group is reconciled by `runInterop`; their range and peer edits come from `buildInteropEdits`, and these entries are excluded from the normal per-entry edit loop so spans never overlap. The group pipeline and its conflict/re-entry behavior are described under [Peer handling](#peer-handling).

`edits` + `rewrite` (`edits.ts`, `rewrite.ts`) turn decisions into span replacements and apply them. `applyEdits` sorts edits descending by start offset so each edit's offsets stay valid as later text shifts and throws on any overlap. The write is atomic, single-file, formatting-preserving.

## Rationale

### No execution of the config

Discovery and rewrite are 100% static through oxc byte spans. There is exactly one canonical call shape and catalog values are literals, so an "execute for truth" step is unnecessary by construction. This is on-brand for a rolldown-adjacent package and avoids running arbitrary build config to learn its versions.

### Surgical span rewrite, operator preserved

Only the version digits inside a `range` literal change; the leading `^`/`~`/exact operator is reused, so an upgrade never reformats the file or mangles the operator. Complex ranges (`>=5 <6`) and non-literal values are surfaced as skips rather than rewritten. Edits apply right-to-left so spans computed against the original source remain valid.

### Major bumps are interactive-only

`--yes` resolves within range only and never offers or applies the latest-overall/major line. Crossing a major requires running interactively and choosing it; there is deliberately no flag that applies a major automatically.

### Idempotent and re-runnable

A package already at the newest available version renders as up to date and is auto-skipped in the walk. Re-running with no available upgrades is a no-op.

## Peer handling

`upgrade` is the component that owns peer-range recomputation; the runtime engine never derives (see [architecture.md](architecture.md) and `package/src/catalogs.ts`). `PeerStrategy` has three values: `"lock"`, `"lock-minor"` and `"interop"`. The first two are per-package and offline; `interop` is a per-catalog group reconcile that needs the registry. All three are CLI-only metadata — `normalizeCatalogs` ignores `strategy` and materializes the `peer` into the `<name>Peers` catalog identically regardless.

`derivePeerRange(range, strategy)` (`peer-range.ts`, built on `semver-effect`) is the single primitive for the offline strategies: `"lock"` pins to the exact chosen version, `"lock-minor"` floors the patch to `.0`, operator preserved. Three behaviors flow from it.

Recompute: on a chosen range bump for an entry with a `strategy`, the candidate's `peerRange` rewrites the existing `peer` literal too, so one upgrade yields two visible edits.

Drift resync (`drift.ts`): if a materialized `peer` no longer matches what `strategy` would produce from the current range (for example a hand-edited range), the walk surfaces a peer-only resync edit even when the range itself is up to date.

Materialize (B3): a package with a `lock`/`lock-minor` `strategy` but no `peer` yet gets a new `peer` literal inserted at the end of the range span (`, peer: "<derived>"`), reusing `applyEdits`' zero-width insert support. This happens in both the interactive and `--yes` paths.

### Interop strategy

`interop` exists for a per-catalog group of interrelated packages that declare each other as peers — the motivating case is the `@effect` ecosystem, where members constrain each other through `peerDependencies`. Where `lock`/`lock-minor` derive one package's peer from its own range, `interop` reconciles the whole group against their cross-peers and derives each member's caret-capped peer floor. It generalizes the old `pnpm-plugin-silk` `resolve-effect-versions.ts` helper: group membership (the set of `interop`-marked packages in one catalog) replaces that script's hardcoded `effect`/`@effect/*` filter. The full rationale is in [the interop peer strategy spec](specs/2026-06-27-interop-peer-strategy-design.md).

The group is reconciled by two pure functions in `interop.ts`, fed pre-fetched peerDeps by `runInterop`. `resolveGroup` pins each member at its chosen version (the ceiling) and downgrades only dependents to satisfy in-group peers: it never raises a ceiling and never downgrades a peer target, so the dependency-only member (effect core, with no in-group peerDeps) is the de-facto anchor. A member with no satisfiable version at or below its pick becomes an `InteropConflict`, left at the user's pick. `deriveFloors` then sets each member's peer to `^<lowest floor any in-group member declares for it>`, falling back to `^<resolved version>` when nothing peer-depends on it.

The two modes surface conflicts differently. Non-interactive (`--yes`) applies the reconciliation and reports any conflicts. The interactive path runs a bounded re-entry loop: when a member is pulled below the user's pick or conflicts, `reentryCandidates` re-enters the affected dependents (capped at their resolved version) and their in-group peer targets (uncapped), so the user can accept the downgrade or raise the anchor. The loop re-runs `runInterop` until the set is internally compatible or a round moves no ceiling (remaining conflicts accepted). The command threads one peerDeps cache through every `runInterop` call in the loop, so an immutable `(pkg, version)` lookup is fetched at most once across the whole walk rather than rebuilt per round; callers that omit the cache (the non-interactive path) get a fresh per-call one. Because the floor is group-derived, interop always does registry work on a run, even when no range changed — unlike `lock`/`lock-minor`, which detect drift offline.

## Command surface

`rolldown-pnpm-config upgrade [file]` (`commands/upgrade.ts`). The file arg is optional: when omitted, `select-file.ts` scans the cwd for a `.ts` file containing a usable `PnpmConfigPlugin(...)` call and errors on zero or multiple candidates. Flags: `--yes`/`-y` (non-interactive latest-in-range), `--dry-run` (print the confirmation diff, write nothing) and `--catalog <name>` (restrict to one catalog). The default path is the interactive walk. A confirmation diff (`summary.ts`) is rendered before any write, even interactively; it reports interop adjustments and any remaining `InteropConflict`s alongside the range/peer edits.

The `minimumReleaseAge` gate applies on every run regardless of flag — both `--yes` and the interactive walk resolve only against versions old enough for the author's own pnpm install to accept (see [Pipeline](#pipeline)).

Note: the brainstorm spec mentions an `up` alias and a `-i/--interactive` flag; the as-built command exposes neither (interactive is the unflagged default). Treat this doc as authoritative on the shipped surface.

## Load-bearing types

`CatalogEntry`, `Candidate` and `Edit` in `package/src/cli/types.ts` are the values that cross the discover → plan → rewrite boundaries; `WalkItem` and `Decision` in `package/src/cli/walk-types.ts` are the interactive-layer contract between `walk-plan`, the reducer and `edits`/`summary`. `PeerStrategy` (now `"lock" | "lock-minor" | "interop"`) and `CatalogPackageSpec` are shared with the authoring surface in `package/src/catalogs.ts`.

The interop pass adds its own load-bearing values in `package/src/cli/interop.ts`: `GroupMember` (a member's pkg, ceiling and candidate versions) is the input to `resolveGroup`; `InteropConflict` (an unsatisfiable member with its blocking constraints) and `InteropResult` (the resolved versions, derived peers, conflicts and the fetch-cache lookup) are what the reconcile produces and what the command and `summary` consume. `ReleaseAgeGate` (effective age minutes plus exempt patterns) in `package/src/cli/release-age.ts` is the combined gate every candidate list is filtered against.

## Related documentation

- [architecture.md](architecture.md) — the build-to-runtime engine and the consolidated `PnpmConfigPlugin` authoring surface the CLI reads and rewrites.
- [settings-coverage.md](settings-coverage.md) — the managed pnpm field matrix (engine-side, not CLI).
- [the catalog upgrade CLI design spec](specs/2026-06-26-catalog-upgrade-cli-design.md) — the original brainstorm and the Phase A/Phase B framing.
- [the interop peer strategy spec](specs/2026-06-27-interop-peer-strategy-design.md) — the `interop` group reconcile and the `minimumReleaseAge` gate rationale.
- `package/src/cli/` — the implementation; `commands/upgrade.ts` is the wiring entry.
- pnpm catalogs: <https://pnpm.io/catalogs>.
