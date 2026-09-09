---
type: Decision
title: Standard plugin, no bundler coupling
description: PnpmConfigPlugin ships as a standard tsdown/rolldown plugin so the library never hard-depends on the Savvy bundler.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: plugin-index
    resource: package/src/plugin/index.ts
---

# Standard plugin, no bundler coupling

## Context

The build step needs to hook into a consumer's bundler to serve the two
virtual modules (the pnpmfile and the catalogs module), and the goal is a
broadly publishable library, not one scoped to a single organization's
toolchain.

## Decision

`PnpmConfigPlugin(config)` returns a plain rolldown `Plugin` — it imports
only `type { Plugin } from "rolldown"`, never `@savvy-web/bundler`
(`package/src/plugin/index.ts:1-2,78-80`).[^plugin-index] The plugin
resolves and loads exactly two virtual specifiers
(`rolldown-pnpm-config/virtual/pnpmfile` and `.../virtual/catalogs`) through
the standard `resolveId`/`load` plugin hooks
(`package/src/plugin/index.ts:50-69`).[^plugin-index] Any consumer on
vanilla tsdown/rolldown can register it directly; a bundler that offers
plugin passthrough (such as `@savvy-web/bundler`) is exercising that same
standard interface, not a special integration this library depends on.

## Alternatives rejected

- **Coupling `PnpmConfigPlugin` to `@savvy-web/bundler`'s plugin surface.**
  Rejected because it would make the Savvy bundler a hard dependency for
  every consumer, foreclosing use by external authors on plain tsdown or
  rolldown and narrowing the library from a broad-public tool to an
  internal one.

## Consequences

- Any consumer on vanilla tsdown/rolldown can use `PnpmConfigPlugin`
  directly, since it depends on nothing beyond the standard rolldown
  `Plugin` shape.[^plugin-index]
- Bundler-specific plugin passthrough (e.g. in `@savvy-web/bundler`) is
  convenience layered on top of a standard plugin, not a special
  integration the library depends on — this preserves the
  broad-public-library goal.

[^plugin-index]: plugin-index
