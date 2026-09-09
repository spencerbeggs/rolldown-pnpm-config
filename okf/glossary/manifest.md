---
type: Glossary
title: manifest
description: The field→{ strategy, enforcement, options? } map freeze produces — not a package manifest or package.json.
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: runtime-index
    resource: ../../package/src/runtime/index.ts
  - id: freeze-impl
    resource: ../../package/src/plugin/freeze.ts
---

# manifest

`manifest` is the field→`{ strategy, enforcement, options? }` map
[freeze](freeze.md) builds alongside [base](base.md): for every declared
field it records which registry `strategy` merges it, which
`enforcement` responds to a divergence, and any strategy-specific
`options` (for example `excludeByRepo`)[^freeze-impl]. `createHooks` walks
`manifest` at runtime, looking up each field's strategy in
`STRATEGY_TABLE` and applying enforcement to the result[^runtime-index].

The trap this term sets: it has nothing to do with a package manifest —
it is not `package.json`, and it does not describe published package
metadata. In this repository "manifest" always means this
strategy/enforcement map.
