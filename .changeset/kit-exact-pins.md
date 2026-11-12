---
"rolldown-pnpm-config": patch
---

## Build System

* The published manifest now pins every `@effected/*`, `@effect/*` and `effect` dependency to an exact version. Installing this package resolves the same kit tree it was tested against, and a newer kit patch reaches it only through a release of this package.
* Your workspace may resolve this package's own kit copies beside newer ones. That is expected; do not override them.
