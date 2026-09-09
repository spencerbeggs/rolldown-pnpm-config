---
type: Interface
title: "{ base, manifest, name } contract"
description: The plain-data payload that crosses from build time into the bundled zero-dependency runtime.
resource: ../../package/src/runtime/index.ts
kind: api
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: runtime-index
    resource: package/src/runtime/index.ts
  - id: runtime-types
    resource: package/src/runtime/types.ts
  - id: warnings-ts
    resource: package/src/runtime/warnings.ts
tags:
  - architecture
---

# { base, manifest, name } contract

## What a consumer gets

This is the only thing that crosses from build time into the bundled
runtime — the boundary that must stay stable. It is three plain-data
values:

- `base: Base` (`Record<string, unknown>`, `package/src/runtime/types.ts:100`)
  — field name to frozen value.[^runtime-types]
- `manifest: Manifest` (`Record<string, ManifestEntry>`,
  `package/src/runtime/types.ts:92`) — field name to `{ strategy,
  enforcement, options? }`.[^runtime-types]
- `name: string` — the validated, non-empty config-dependency identifier.

`createHooks(base, manifest, name)` (`package/src/runtime/index.ts:22`)
returns `{ updateConfig }`, the runtime's install-time entry
point.[^runtime-index] `createHooks` is `@public` and requires all three
arguments; the third, `name`, is a required parameter, so any external
caller built against a two-argument `createHooks` is broken by this
contract.[^runtime-index]

## What stays stable

- `base` and `manifest` carry no Effect, no functions, and nothing but
  serializable data — `Base` and `Manifest` are plain `Record` types
  (`package/src/runtime/types.ts:92,100`).[^runtime-types]
- `manifest`'s per-field `ManifestEntry.strategy` names a strategy by
  string key (`package/src/runtime/types.ts:80-84`), looked up in
  `STRATEGY_TABLE` at `package/src/runtime/index.ts:30`, so the build
  emits no strategy code itself.[^runtime-index]
- `name` is tagged onto every warning box `createHooks` prints, as
  `[<name>]` on the first line (`package/src/runtime/warnings.ts:21,49`).[^warnings-ts]
- The bundled artifact importing only this contract — nothing from
  Effect — is what keeps consumer installs dependency-free; see
  [effect-at-build-time-only](../decisions/effect-at-build-time-only.md).

## What is not part of the promise

How `base` and `manifest` are produced — the `freeze` validation step
(`package/src/plugin/freeze.ts`), the descriptor-derived schemas, and the
catalog and `peerDependencyRules` special-casing — is build-time
machinery, not part of this contract. A consumer of the runtime only ever
sees the three plain values.

[^runtime-index]: runtime-index
[^runtime-types]: runtime-types
[^warnings-ts]: warnings-ts
