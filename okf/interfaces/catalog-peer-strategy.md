---
type: Interface
title: Catalog entry, peer strategy, and version source
description: The catalog package spec shape an author writes, the PeerStrategy/VersionSource authoring fields, and the colon-only <name>:peers materialized catalog naming.
resource: ../../package/src/catalogs.ts
kind: api
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: discover-ts
    resource: package/src/cli/discover.ts
  - id: catalogs-ts
    resource: package/src/catalogs.ts
  - id: changelog
    resource: package/CHANGELOG.md
tags:
  - architecture
---

# Catalog entry, peer strategy, and version source

## What a consumer gets

A catalog package's version is a bare range string, or an object carrying
a materialized peer range plus optional CLI metadata:[^catalogs-ts]

```ts
type CatalogPackageSpec =
 | string
 | {
   range: string;
   peer?: string;
   strategy?: PeerStrategy;
   source?: VersionSource;
   };
```

`PeerStrategy` is `"lock" | "lock-minor" | "interop"` — how the `upgrade`
CLI recomputes a materialized `peer` range when `range` is bumped.
CLI-only metadata; the runtime ignores it.[^catalogs-ts] `VersionSource` is
`"registry" | "workspace"` (absent = `"registry"`) — where the `upgrade`
CLI resolves the entry's `range` from.[^catalogs-ts]

## Why `source` is orthogonal to `strategy`

`source` governs *where* a version is resolved from; `strategy` governs
*how* `peer` is derived from `range`. Collapsing the two would drop peer
materialization entirely — a workspace-sourced entry still needs a peer
strategy to materialize its `peer` range, and a registry-sourced entry can
equally use any of the three strategies.[^catalogs-ts] Both are CLI/build-side
metadata that `normalizeCatalogs` ignores when producing the runtime-facing
catalog maps.[^catalogs-ts]

## The `<name>:peers` materialized catalog naming

`normalizeCatalogs` emits a peers catalog only for packages carrying a
materialized `peer`, under the `<name>:peers` colon-delimited name — using
the `peer` value verbatim.[^catalogs-ts] This naming is colon-only. A
legacy camelCase alias (`<name>Peers`) was emitted alongside the
colon-delimited form for a transition period and then removed — a
breaking change shipped as a **minor** version by design, since the
compatibility window was intentional and brief.[^changelog]

## `normalizeCatalogs` skips, never throws, on non-declaration siblings

An untyped JS consumer (or a future reserved key) may place a
non-declaration sibling inside the `catalogs` map — a function, or an
object with no `packages` map. `normalizeCatalogs` ignores it rather than
throwing: the failure mode "catalog silently not found" is already
indistinguishable from "nothing to update", so crashing here would be
strictly worse.[^catalogs-ts] The `upgrade` CLI's static discovery walk
(`package/src/cli/discover.ts:103-105`) skips such siblings
identically.[^discover-ts]

## What stays stable

- `normalizeCatalogs` is pure: the base catalog uses each package's
  `range` (or the bare string); the peers catalog, when emitted, uses
  `peer` verbatim.[^catalogs-ts]
- `strategy` and `source` never reach the runtime — they exist purely for
  the `upgrade` CLI's discover → plan → rewrite pipeline (see
  [descriptor-table](../models/descriptor-table.md) for the maintainer
  side of the descriptor this authoring shape ultimately feeds through
  `peerDependencyRules`/`catalogs` special-casing at freeze time).

## What is not part of the promise

- How `strategy` (`lock`, `lock-minor`, `interop`) actually recomputes a
  `peer` range, how interop group reconciliation resolves cross-peer
  conflicts, and how `source: "workspace"` resolves a next-release
  version are `upgrade`-CLI-side pipeline mechanics, not part of this
  authoring contract.
- The `PeerDerivation`/`PeerWarning`/`InteropConflict` types the CLI
  produces internally while planning an edit are CLI-internal, not
  authoring-surface types.

[^discover-ts]: discover-ts
[^catalogs-ts]: catalogs-ts
[^changelog]: changelog
