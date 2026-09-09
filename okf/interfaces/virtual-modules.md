---
type: Interface
title: Virtual module specifiers
description: The two virtual module specifiers PnpmConfigPlugin serves and the ambient types a consumer opts into to type-check imports from them.
resource: ../../package/src/virtual.d.ts
kind: api
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: virtual-dts
    resource: package/src/virtual.d.ts
  - id: plugin-index
    resource: package/src/plugin/index.ts
tags:
  - architecture
---

# Virtual module specifiers

## What a consumer gets

Consumers integrate by adding `PnpmConfigPlugin({...})` to a tsdown/rolldown
build and re-exporting two virtual specifiers the plugin serves
(`package/src/plugin/index.ts:16-17`):[^plugin-index]

- `rolldown-pnpm-config/virtual/pnpmfile` — exports `hooks: { updateConfig(config)
  }` plus a `Catalogs` type alias (`Map<string, Map<string, string>>`) and a
  `PnpmConfig` interface.[^virtual-dts]
- `rolldown-pnpm-config/virtual/catalogs` — exports `catalogs: Catalogs`, a
  standalone sorted `Map` literal for programmatic catalog reads.[^virtual-dts]

`package/src/virtual.d.ts` declares the ambient types for both specifiers.
A consumer opts in with one reference directive, in a build entry or a
`types/*.d.ts` file:[^virtual-dts]

```ts
/// <reference types="rolldown-pnpm-config/virtual" />
```

After that, imports from either virtual specifier type-check with no
further per-module boilerplate.[^virtual-dts]

## What stays stable

- The two specifier strings themselves, `PNPMFILE_SPEC` and
  `CATALOGS_SPEC` (`package/src/plugin/index.ts:16-17`).[^plugin-index]
- `hooks.updateConfig(config): PnpmConfig` on the pnpmfile module, and
  `catalogs: Catalogs` on the catalogs module — the minimal shape a
  consumer needs to call the runtime or read catalog data
  programmatically.[^virtual-dts]

## Why the types are inlined, not imported

`package/src/virtual.d.ts` is load-bearingly self-contained: it ships
byte-for-byte and is never compiled, so any cross-module import inside it
(for example pulling `PnpmHooks` from `rolldown-pnpm-config/runtime`)
would resolve against this package's own *source* `exports` map during the
bundler's declaration pass and drag a raw `.ts` file into API Extractor's
analysis (`ae-wrong-input-file-type`) — the file's own header comment
records this.[^virtual-dts] The minimal `PnpmConfig`/`hooks.updateConfig`
shape is therefore inlined and must be kept in sync **by hand** with
`package/src/runtime/types.ts` — the duplication is deliberate, and the
sync note lives in the file itself (`package/src/virtual.d.ts:12-16`).[^virtual-dts]
See [virtual-dts-stays-self-contained](../conventions/virtual-dts-stays-self-contained.md)
for the convention this constraint imposes on future edits to this file.

## What is not part of the promise

The full `PnpmHooks`/`RuntimeCtx` shape in `package/src/runtime/types.ts`
is not exposed through the virtual pnpmfile module — only the minimal
`PnpmConfig`/`updateConfig` slice a consumer needs is inlined here; see
[{ base, manifest, name } contract](base-manifest-name.md) for the fuller
runtime contract these ambient types intentionally narrow.

[^virtual-dts]: virtual-dts
[^plugin-index]: plugin-index
