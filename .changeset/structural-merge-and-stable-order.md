---
"rolldown-pnpm-config": patch
---

## Bug Fixes

- A `local` directive with `strategy: "union"` or `"difference"` on an array field now compares elements by value. Two objects with the same keys dedupe in a union and match in a difference, whatever their key order. Before, a union kept both copies, and a difference missed an object whose keys were written in another order.
- `export` and `preview` sort keys and array fields by character code instead of the machine's locale, so the written `pnpm-workspace.yaml` is the same on every machine. Uppercase now sorts before lowercase. The pnpmfile runtime's array merges use the same order.
- A `pnpm-workspace.yaml` whose top level is a list is read as an empty workspace instead of a record keyed `"0"`, `"1"`, and so on.
- An `overrides` array authored beside `overridesFromCatalogs` is ignored instead of being spread into index-keyed overrides.
- `export` and `preview` stop with a "Cannot read or parse" error when they cannot check whether `pnpm-workspace.yaml` exists (for example a permission error), instead of treating the file as absent and writing a fresh one.
