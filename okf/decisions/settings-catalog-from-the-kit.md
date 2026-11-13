---
type: Decision
title: pnpm setting facts come from the kit's settings catalog
description: The plugin keeps only its policy (strategy, enforcement, directives) and takes every setting's schema, kind and locations from @effected/pnpm/settings, dropping the settings pnpm 12 does not read.
status: draft
supersedes: descriptor-table-as-source-of-truth.md
generated:
  by: claude-code/opus
  at: 2026-11-13T06:08:51Z
sources:
  - id: registry
    resource: package/src/registry.ts
  - id: freeze
    resource: package/src/plugin/freeze.ts
  - id: owner
    resource: conversation with the repository owner
    author: human:spencer
    last_modified: 2026-11-12T00:00:00Z
integrity:
  generated:
    body: 5c53e64567939803
---

# pnpm setting facts come from the kit's settings catalog

## Context

The descriptor table held both facts about pnpm (each setting's schema, kind,
whether it belongs in `pnpm-workspace.yaml`) and this plugin's policy over
them. The facts had drifted from pnpm 12: seven settings no pnpm reads, five
build settings pnpm 12 accepts but never applies, pnpm 11's
`confirmModulesPurge`, and shapes pnpm 12 widened or narrowed (`auditConfig`
is `{ ignoreGhsas }`, `nodeLinker` gained `loaded`, `lockfile` and
`sideEffectsCache` gained object forms). `@effected/pnpm/settings` now
derives those facts from pnpm 12's own config crate.

## Decision

The plugin keeps only policy: `FIELD_REGISTRY` maps each managed setting to a
`strategy` and an `enforcement`, `satisfies` the catalog's key set, and every
schema and location is read from the catalog entry.[^registry] Settings pnpm
12 does not read are no longer offered, and a config that still names one
fails the build with what to use instead.[^freeze] The owner ruled this a
major release where correct behaviour outranks byte-identical output.[^owner]

## Consequences

- A setting pnpm 12 does not read cannot be offered: the table fails to
  compile.
- `freeze` refuses excess keys in closed settings and ships the canonical
  value pnpm reads (a coerced word becomes its boolean).
- A catalog setting without a policy entry is refused at build (`is a pnpm 12
  setting this plugin does not manage`) rather than shipped nowhere; managing
  it is one policy row. `audit` and `update`, the sections that supersede
  `auditConfig` and `updateConfig`, are managed with `mapChildWins`.
- The CLI's registry reads take the configuration pnpm 12 connects with
  (`PnpmNpmConfig`), so a `registry:` in `pnpm-workspace.yaml` routes them.

[^registry]: registry
[^freeze]: freeze
[^owner]: owner
