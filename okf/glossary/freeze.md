---
type: Glossary
title: freeze
description: The single build-time step where Effect runs, validating a plugin author's declared config and emitting `{ base, manifest, name }`.
generated:
  by: okfit/claude-code
  at: 2026-10-11T16:12:12Z
sources:
  - id: freeze-impl
    resource: ../../package/src/plugin/freeze.ts
integrity:
  generated:
    body: f3d1ad84196af763
---

# freeze

`freeze` is the one function in this repository that runs Effect[^freeze-impl].
It takes the plugin author's `PluginConfig`, validates `name` and each
declared field against its descriptor-derived Schema, resolves the
`peerDependencyRules.allowedVersionsFromCatalogs` and `overridesFromCatalogs`
directives into concrete entries, and returns
`{ base, manifest, name }` — the three values that cross into the bundled,
zero-dependency runtime[^freeze-impl].

Nothing to do with `Object.freeze` or JavaScript's object-freezing
semantics — the name refers to fixing a config in place at build time so
the runtime never needs to revalidate it.

See also [base](base.md) and [manifest](manifest.md), the two halves of
`freeze`'s output.
