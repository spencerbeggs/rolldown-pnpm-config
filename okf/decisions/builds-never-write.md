---
type: Decision
title: Builds never write
description: The build reads a plugin author's config exactly as authored; only the upgrade CLI rewrites it. A memoized freeze-path sync that violated this was deleted after dogfood adoption exposed both an ungated write and a split-brain correctness defect.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: freeze
    resource: package/src/plugin/freeze.ts
  - id: plugin-index
    resource: package/src/plugin/index.ts
  - id: upgrade-cli
    resource: package/src/cli/commands/upgrade.ts
tags:
  - architecture
---

# Builds never write

## Context

`PnpmConfigPlugin(config)` runs the Effect `freeze` step once and memoizes
the result on the plugin closure (`frozen ??= Effect.runPromise(...)`,
`package/src/plugin/index.ts:48`), because the bundler invokes the plugin
across several passes and the validate-freeze-manifest work must not
repeat.[^plugin-index] Catalog entries can declare `source: "workspace"` to
track the local workspace's next release versions instead of the npm
registry.

An earlier iteration of this branch ran a workspace-source sync
(`syncWorkspaceCatalogs`) inside that memoized freeze path, paired with an
`onCatalogUpdate` notification callback intended to gate the sync's effect
behind a caller-supplied check. Dogfood adoption by the first consumer
showed the sync mutated the consumer's `savvy.build.ts` on every ordinary
build once any catalog entry declared `source: "workspace"`, and it did so
ungated: the callback env-gate sat one layer too high, because the sync
wrote the file first and the callback only notified *after* the write had
already happened. None of `syncWorkspaceCatalogs`, `onCatalogUpdate`, or the
associated `CatalogChange`/`CatalogChanges` types exist anywhere in
`package/src/` today — the whole surface was removed.

The post-removal audit then found a second, independent defect in the same
shape, and it is the stronger argument for the outcome here. The freeze path
has exactly two consumers of `config.catalogs`: `normalizeCatalogs`, feeding
the emitted catalogs (`package/src/plugin/freeze.ts:64`), and
`resolvePeerDependencyRules`, which resolves the
`allowedVersionsFromCatalogs` directive
(`package/src/plugin/freeze.ts:86`).[^freeze] Under the sync, a drifted
build fed the directive the **overlaid** next versions while emission used
them too — but the author's own on-disk config still held the source
literals, so two readers of one logical config inside a single build could
disagree. That surfaced as peer rules derived from versions the emitted
catalogs did not actually agree with. The split-brain was reachable only for
a consumer using **both** the `allowedVersionsFromCatalogs` directive and
`source:` entries, but where reachable it was a silent correctness defect,
not merely a nuisance write.

## Decision

Builds never write, structurally, not by convention: the build reads
`config` exactly as authored, and a workspace-sourced catalog entry is
rewritten only by the `upgrade` CLI — `--yes` applies the rewrite, `--check`
is a pure gate that exits 1 on drift without writing
(`package/src/cli/commands/upgrade.ts:604`-`620`).[^upgrade-cli] The fix for
both defects above was to delete the `syncWorkspaceCatalogs` mutation path
entirely rather than gate it more tightly. With the `upgrade` CLI as the
sole writer, the cross-repo convergence requirement this feature had to
satisfy is still met. The final shape is uniformly "as authored": both
`normalizeCatalogs` and `resolvePeerDependencyRules` read the same
`config.catalogs` value passed into `freeze` (`freeze.ts:64` and
`freeze.ts:86`),[^freeze] which eliminates the split-brain defect class
outright — a build emits exactly what the source says, always. Because the
defect was caught pre-publish, the whole surface — `syncWorkspaceCatalogs`,
the `onCatalogUpdate` callback, and the `CatalogChange`/`CatalogChanges`
types — could be deleted outright rather than carried forward as deprecated.

## Alternatives rejected

- **Gate the sync behind the callback env-gate as originally documented.**
  Rejected on two independent grounds. First, gating does not fix the defect
  it was meant to fix: the sync wrote `savvy.build.ts` *before* the callback
  ran, so no callback-side gate — however carefully written — could prevent
  the write from happening; the gate was structurally one layer too late to
  intercept it. Second, even a correctly-ordered gate would not have touched
  the independent split-brain defect, which was a property of the sync
  existing at all (two readers of `config.catalogs` disagreeing when one saw
  overlaid versions and the other saw source literals), not a property of
  when or whether the sync's side effect was announced. Deletion closes both
  problems at once; gating could only have closed the first, and only if
  moved to the correct layer.
- **Deprecate the sync surface rather than delete it.** Rejected because the
  feature was caught pre-publish — there were no external consumers of
  `syncWorkspaceCatalogs`, the `onCatalogUpdate` callback, or the
  `CatalogChange`/`CatalogChanges` types to carry a deprecation period for.

## Consequences

- Do not reintroduce any build-time write path, memoized or not — the build
  step's only legitimate output is the `{ base, manifest, name }` contract
  handed to the runtime; it never mutates a consumer's files.
- A workspace-sourced (`source: "workspace"`) catalog entry is rewritten
  exclusively by the `upgrade` CLI's `--yes` (apply) or `--check` (gate)
  paths; any new automation that wants to update such an entry belongs
  there, not in `freeze` or the plugin's build hook.
- `normalizeCatalogs` (`freeze.ts:64`) and `resolvePeerDependencyRules`
  (`freeze.ts:86`) must keep reading the same `config.catalogs` value — if a
  future change gives either of them a different view of the catalogs
  (overlaid, cached, or otherwise transformed), it reopens exactly the
  split-brain defect class this decision closed.[^freeze]
- `syncWorkspaceCatalogs`, the `onCatalogUpdate` callback, and
  `CatalogChange`/`CatalogChanges` are gone from `package/src/`; do not
  reintroduce them under the same or a similar name as a "fix" for a future
  workspace-source convenience request — the convergence requirement they
  served is already met by the `upgrade` CLI being the sole writer.

[^freeze]: freeze
[^plugin-index]: plugin-index
[^upgrade-cli]: upgrade-cli
