---
type: Convention
title: Import and module style
description: "The enforced relative-import extension, node: protocol, import-type, and no-unused/no-cycle rules, plus the strict TypeScript flags that turn violations into compile errors, and the counter-rule against hand-formatting."
stale_after: 2026-12-08T00:00:00Z
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: biome-config
    resource: biome.json
  - id: lint-staged-config
    resource: lib/configs/lint-staged.config.ts
---

# Import and module style

Follow these rules when writing an import or a type-only import; Biome
enforces every one of them as an error via `@savvy-web/silk/biome`, which
`biome.json` extends.[^biome-config]

- Give every relative import its emitted extension: `.ts`/`.tsx` sources
  import as `.js`, `.mts` imports as `.mjs`, `.cts` imports as `.cjs`; an
  asset import (`.json`, `.css`) keeps its real extension.
- Use the `node:` protocol for Node.js built-ins — `node:fs`, `node:path` —
  never the bare specifier.
- Write type-only imports as `import type { Foo } from "./bar.js"`, never
  `import { type Foo } from "./bar.js"`.
- Never leave an unused variable (rest siblings are excepted).
- Never introduce an import cycle.

## Strict TypeScript flags back these up

Two strict compiler flags make a subset of these violations fail
`typecheck`, not just `lint`, so a mis-written import or an unsound
optional property blocks CI even if a Biome pass is skipped:

- `verbatimModuleSyntax` — a type-only import written without `import type`
  is a compile error, not just a lint finding.
- `exactOptionalPropertyTypes` — an optional property cannot be explicitly
  set to `undefined`.

## Do not hand-format

Do not hand-sort imports, hand-order `package.json` keys, or run a
formatting pass "to be safe". `lint-staged` (`lib/configs/lint-staged.config.ts`,
`Preset.silk()`) runs `sort-package-json` then `biome check --write` on
staged `package.json` files, and `biome check --write` — which formats,
applies safe fixes, and organizes imports — on staged JS/TS/JSON
files.[^lint-staged-config] Write correct code and let the pre-commit hook
apply the formatting; a hand-formatting pass only produces a diff the hook
immediately reformats again.
