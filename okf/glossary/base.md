---
type: Glossary
title: base
description: The frozen field→value map a plugin author declared, one of the three values freeze produces for the bundled runtime.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: runtime-index
    resource: ../../package/src/runtime/index.ts
  - id: freeze-impl
    resource: ../../package/src/plugin/freeze.ts
---

# base

`base` is the field→value map [freeze](freeze.md) builds up while it
validates a plugin author's config — `base.catalogs`, `base[field]` for
every declared managed field[^freeze-impl]. It is one of the three values
`freeze` returns (`{ base, manifest, name }`)[^freeze-impl] and is passed,
alongside `manifest` and `name`, into `createHooks` to build the pnpm
`updateConfig` hook[^runtime-index].

At runtime each strategy in the [manifest](manifest.md) receives
`base[field]` as its "managed" side of the merge — the value the plugin
author declared, as opposed to the consumer's local
`pnpm-workspace.yaml`[^runtime-index].
