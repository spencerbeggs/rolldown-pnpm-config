---
type: Decision
title: An opt-in `<name>:exact` catalog derived from each range
description: Tools that must pin the kit exactly get a derived `<name>:exact` catalog (operator stripped from each range), opted into per declaration, failing loudly on a range with no single version and following overridesFromCatalogs' frozen pins.
status: draft
sources:
  - id: catalogs
    resource: package/src/catalogs.ts
  - id: overrides
    resource: package/src/plugin/overrides-from-catalogs.ts
  - id: freeze
    resource: package/src/plugin/freeze.ts
tags:
  - deps
  - release
generated:
  by: okfit/claude-code
  at: 2026-11-11T19:21:18Z
integrity:
  generated:
    body: 4e6899f738007552
---

# An opt-in `<name>:exact` catalog derived from each range

## Context

A `catalog:` specifier publishes whatever range the catalog holds, which is
usually a caret. A library wants that, so a host dedupes onto one copy. A
tool (a CLI, an MCP server, a bundler plugin) shares no values with its
host and should pin its kit dependencies exactly, so a kit patch never
reaches an installed tool without a release of the tool (effected#1333:
a tool published `@effected/lockfiles@^0.24.0` beside `@effected/npm@^0.33.0`,
and a `lockfiles` patch requiring `npm@0.34` broke it). Before this, such a
tool's only option was hand-writing exact versions, which left the catalog
and stopped moving when the catalog's plugin was bumped.

## Decision

`CatalogDeclaration.exact: true` makes `normalizeCatalogs` emit a third
catalog, `<name>:exact`, beside `<name>` and `<name>:peers`. Each entry is
the range with its operator stripped. The rules:

- **Opt-in per declaration.** A catalog that does not set `exact: true`
  emits nothing new, and an entry-level `exact` there is an error rather
  than silently ignored.
- **Derivable means one comparator on one version**: `^`, `~`, `>=`, `=`
  or none, the same operator set `overridesFromCatalogs` pins. A
  prerelease derives (`^1.0.0-rc.1` → `1.0.0-rc.1`). Compound ranges,
  wildcards, tags, `<`/`>`, `X.x`, partial versions and protocol specifiers
  do not.
- **A non-derivable range fails the build** with the catalog, package and
  range named, unless its entry sets `exact: "<plain version>"` or
  `exact: false`. An explicit value on a derivable range is rejected,
  because `upgrade` rewrites `range` and would leave the hand-written value
  stale.
- **It follows the frozen pin.** `pinCatalogs` writes the override's exact
  version into `<name>:exact` as well as `<name>`, so
  `catalog:<name>:exact` and the graph-wide override never disagree.
- **It is derived, never declared.** `overridesFromCatalogs` and
  `allowedVersionsFromCatalogs` reject `<name>:exact` as undeclared, as
  they do `<name>:peers`, and `upgrade` reads only the authored
  declaration, so the variant cannot drift: it re-derives from `range` on
  every build.

Because it lands in `base.catalogs`, the pnpmfile runtime, `export` and
`preview` carry it with no further change.

## Alternatives rejected

- **Always emit `:exact` for every catalog.** Doubles every consumer's
  catalog list and makes a non-derivable range in any catalog a build
  failure. Opt-in keeps it to the catalogs a tool family pins.
- **Skip a non-derivable range silently.** A `catalog:<name>:exact`
  dependent would then fail at install with "not in catalog", far from the
  cause. Failing at build names the entry.
- **Let an explicit `exact` override any range.** It would go stale on the
  next `upgrade`; restricting it to ranges `upgrade` cannot rewrite keeps
  both moving together.
- **Derive `:exact` from the authored range only, ignoring the override.**
  An authored override winning with a newer exact version would leave
  `:exact` naming a second copy.
