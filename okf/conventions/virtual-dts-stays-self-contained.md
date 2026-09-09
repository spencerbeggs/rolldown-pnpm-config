---
type: Convention
title: Keep virtual.d.ts self-contained
description: Never write a cross-module import inside package/src/virtual.d.ts; inline the types it needs and hand-sync them with the runtime source.
stale_after: 2026-12-08T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: virtual-dts
    resource: package/src/virtual.d.ts
  - id: runtime-types
    resource: package/src/runtime/types.ts
---

# Keep virtual.d.ts self-contained

Never add a cross-module import to `package/src/virtual.d.ts` — no
`import type { PnpmHooks } from "rolldown-pnpm-config/runtime"`, no import
from any sibling source file. Inline whatever shape the ambient declarations
need instead.[^virtual-dts]

## Why

`virtual.d.ts` ships byte-for-byte and is never compiled — consumers opt in
with `/// <reference types="rolldown-pnpm-config/virtual" />` and read the
file as-is.[^virtual-dts] A cross-module import inside it (for example
pulling `PnpmHooks` from `rolldown-pnpm-config/runtime`) resolves against
this package's own *source* `exports` map during the bundler's declaration
pass, which drags a raw `.ts` file into API Extractor's analysis and fails
with `ae-wrong-input-file-type`; the file's own header comment records this
reasoning.[^virtual-dts]

## The maintenance duty this creates

Because the file cannot import, the minimal `PnpmConfig` and
`hooks.updateConfig` shape it declares is inlined and duplicates the real
`PnpmConfig`/`PnpmHooks` interfaces in `package/src/runtime/types.ts`.[^runtime-types]
Whoever changes `PnpmConfig`/`PnpmHooks` in `runtime/types.ts` must
hand-update the inlined copy in `virtual.d.ts` in the same change — the two
are not type-checked against each other, so drift is silent until a
consumer's build breaks.[^virtual-dts]

See [descriptor table](../modules/descriptors.md) for another place a single
source of truth is derived rather than hand-duplicated; `virtual.d.ts` is the
deliberate exception, forced by the declaration-pass constraint above.

[^virtual-dts]: virtual-dts
[^runtime-types]: runtime-types
