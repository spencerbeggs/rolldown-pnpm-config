---
type: Decision
title: Data-driven refines, not injected code
description: Repo-dependent merge behavior is modeled as a data-driven refine on a descriptor, not as arbitrary injected code, keeping the manifest plain serializable data.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: ctx
    resource: package/src/runtime/ctx.ts
  - id: descriptors-types
    resource: package/src/descriptors/types.ts
  - id: runtime-index
    resource: package/src/runtime/index.ts
---

# Data-driven refines, not injected code

## Context

Some Silk behavior depends on which repo consumes the plugin and so cannot
be expressed as a static strategy — chiefly its per-repo hoist exclusion,
which needs different packages dropped from the merged `publicHoistPattern`
list for different consuming repos. The engine's `{ base, manifest }`
contract crosses from build time into a zero-dependency bundled runtime, so
whatever expresses this repo-dependent behavior has to survive that
boundary as plain data.

## Decision

Repo-dependent behavior is modeled as a data-driven `excludeByRepo` refine.
`FieldOptions` on a descriptor carries only a boolean flag —
`readonly excludeByRepo?: boolean` — never a function
(`package/src/descriptors/types.ts:20-22`).[^descriptors-types] At install
time, `resolveRootName` resolves the consuming repo's `package.json` name
and `excludeByRepo` drops the packages assigned to that repo from the
merged hoist list (`package/src/runtime/ctx.ts:12-44`).[^ctx] The runtime's
merge loop applies this refine to the strategy's `merged` value, keyed off
`entry.options?.excludeByRepo`, before enforcement runs
(`package/src/runtime/index.ts:33-39`).[^runtime-index]

## Alternatives rejected

- **Arbitrary code-injected refines** (an author-supplied function run
  during merge). Deliberately not built: `FieldOptions` models
  `excludeByRepo` as a boolean flag interpreted by the runtime, not as a
  place to inject a function (`package/src/descriptors/types.ts:20-22`) —
  allowing arbitrary code into a refine would make the manifest something
  other than plain serializable data, undermining the same build/runtime
  data-only boundary that keeps the shipped pnpmfile a zero-dependency
  artifact.[^descriptors-types]

## Consequences

- `publicHoistPattern` is the one field with a documented `options` refine
  in the descriptor table; any future repo-dependent behavior has to fit
  the same data-driven refine shape rather than reach for injected code.
- The manifest stays plain serializable data end to end, which is what lets
  it be baked verbatim into the emitted virtual modules.

[^ctx]: ctx
[^descriptors-types]: descriptors-types
[^runtime-index]: runtime-index
