---
type: Glossary
title: materialize
description: Two related senses — normalizeCatalogs materializing a `<name>:peers` catalog from declared peer values, and the upgrade CLI materializing a missing peer literal into the config source.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: catalogs-impl
    resource: ../../package/src/catalogs.ts
  - id: edits-impl
    resource: ../../package/src/cli/edits.ts
---

# materialize

This repository uses "materialize" in two related senses, both worth
knowing:

1. **Runtime/build sense** — `normalizeCatalogs` materializes a
   `<name>:peers` catalog: for every package in a catalog declaration
   that carries a `peer` value, it emits that value verbatim into a
   sibling catalog named `<name>:peers`, skipping packages with no
   `peer`[^catalogs-impl]. This is what [freeze](freeze.md) validates
   into [base](base.md).catalogs.
2. **CLI-authoring sense** — the `upgrade` CLI materializes a *missing*
   `peer` literal into the plugin config's source text: when an
   `interop`-strategy entry has no `peer` span, `buildEdits` inserts one
   via a zero-width edit — `span: [insertAt, insertAt]` with text
   `, peer: "<value>"` — rather than rewriting an existing span, because
   there is no existing literal to replace[^edits-impl].

Both senses describe turning a value the runtime or CLI derives into a
literal that actually appears — as a catalog entry in sense 1, as source
text in sense 2.
