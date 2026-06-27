---
status: current
module: rolldown-pnpm-config
category: architecture
created: 2026-06-27
updated: 2026-06-27
last-synced: 2026-06-27
completeness: 90
related:
  - architecture.md
  - settings-coverage.md
  - specs/2026-06-26-catalog-upgrade-cli-design.md
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

Built across phases B1 (non-interactive core), B2 (interactive Ink walk + drift + dry-run + catalog filter) and B3 (peer materialization + config autodetect). The implementation records are the dated plan docs under `plans/`. The pure units (`discover`, `plan`, `peer-range`, `drift`, `walk-plan`, `walk-reducer`, `edits`, `summary`, `select-file`) are unit-tested; the Ink render shell, the `pnpm`-shelling resolver and the `@effect/cli` wiring are integration-tested under `package/__test__/cli/`.

## Pipeline

The command (`package/src/cli/commands/upgrade.ts`) wires single-purpose units in sequence. Data crosses each boundary as plain values.

`discover` (`discover.ts`) parses the source with `oxc-parser`, finds the one `PnpmConfigPlugin(...)` call and walks `catalogs.<name>.packages`. Each package whose range is a simple-operator string literal becomes a `CatalogEntry` carrying byte-offset spans for the range literal and any `peer` literal. Anything non-literal or with a complex multi-comparator range is returned in `skipped`, never rewritten.

`resolve` (`resolve.ts`) is the only Effect service: `RegistryResolver` shells out to `pnpm view <pkg> versions --json`, reusing the user's `.npmrc`, scoped registries and auth tokens. Per-package failures are swallowed to a skip, never aborting the run.

`plan` (`plan.ts`) computes the candidate list per entry with `semver-effect`: latest-in-range (when newer than current), latest-overall stable (when newer than the in-range pick, possibly a major jump) and keep. Prereleases are filtered out. When the entry carries a `strategy`, each non-keep candidate gets a recomputed `peerRange`.

The choice layer differs by mode. Non-interactive (`--yes`) takes latest-in-range directly and never the major. Interactive builds `WalkItem`s (`walk-plan.ts`) and runs the Ink `Walk` (`ui/Walk.ts`) driven by the pure `walk-reducer.ts` state machine, collecting `Decision`s through the `runWalk` bridge (`ui/run-walk.ts`).

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

`upgrade` is the component that owns peer-range recomputation; the runtime engine never derives (see [architecture.md](architecture.md) and `package/src/catalogs.ts`). `derivePeerRange(range, strategy)` (`peer-range.ts`, built on `semver-effect`) is the single primitive: `"lock"` pins to the exact chosen version, `"lock-minor"` floors the patch to `.0`, operator preserved. Three behaviors flow from it.

Recompute: on a chosen range bump for an entry with a `strategy`, the candidate's `peerRange` rewrites the existing `peer` literal too, so one upgrade yields two visible edits.

Drift resync (`drift.ts`): if a materialized `peer` no longer matches what `strategy` would produce from the current range (for example a hand-edited range), the walk surfaces a peer-only resync edit even when the range itself is up to date.

Materialize (B3): a package with `strategy` but no `peer` yet gets a new `peer` literal inserted at the end of the range span (`, peer: "<derived>"`), reusing `applyEdits`' zero-width insert support. This happens in both the interactive and `--yes` paths.

## Command surface

`rolldown-pnpm-config upgrade [file]` (`commands/upgrade.ts`). The file arg is optional: when omitted, `select-file.ts` scans the cwd for a `.ts` file containing a usable `PnpmConfigPlugin(...)` call and errors on zero or multiple candidates. Flags: `--yes`/`-y` (non-interactive latest-in-range), `--dry-run` (print the confirmation diff, write nothing) and `--catalog <name>` (restrict to one catalog). The default path is the interactive walk. A confirmation diff (`summary.ts`) is rendered before any write, even interactively.

Note: the brainstorm spec mentions an `up` alias and a `-i/--interactive` flag; the as-built command exposes neither (interactive is the unflagged default). Treat this doc as authoritative on the shipped surface.

## Load-bearing types

`CatalogEntry`, `Candidate` and `Edit` in `package/src/cli/types.ts` are the values that cross the discover → plan → rewrite boundaries; `WalkItem` and `Decision` in `package/src/cli/walk-types.ts` are the interactive-layer contract between `walk-plan`, the reducer and `edits`/`summary`. `PeerStrategy` and `CatalogPackageSpec` are shared with the authoring surface in `package/src/catalogs.ts`.

## Related documentation

- [architecture.md](architecture.md) — the build-to-runtime engine and the consolidated `PnpmConfigPlugin` authoring surface the CLI reads and rewrites.
- [settings-coverage.md](settings-coverage.md) — the managed pnpm field matrix (engine-side, not CLI).
- [the catalog upgrade CLI design spec](specs/2026-06-26-catalog-upgrade-cli-design.md) — the original brainstorm and the Phase A/Phase B framing.
- `package/src/cli/` — the implementation; `commands/upgrade.ts` is the wiring entry.
- pnpm catalogs: <https://pnpm.io/catalogs>.
