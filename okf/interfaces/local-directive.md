---
type: Interface
title: LocalDirective
description: The per-field export-time override contract authors write under `local` in a `PnpmConfigPlugin({...})` call.
kind: api
resource: ../../package/src/define-plugin.ts
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: define-plugin-ts
    resource: ../../package/src/define-plugin.ts
  - id: local-merge-ts
    resource: ../../package/src/cli/local-merge.ts
---

# LocalDirective

## Shape

`LocalDirective<T>` (`package/src/define-plugin.ts:20-24`) is:

```ts
interface LocalDirective<T> {
 readonly preserve?: readonly string[];
 readonly value?: T;
 readonly strategy?: "union" | "difference" | "merge" | "rewrite";
}
```

Every key is optional.[^define-plugin-ts] The `local` field of
`PluginConfig` accepts, per key, either a raw value or a `LocalDirective`
wrapping one (`define-plugin.ts:47-56`).[^define-plugin-ts] This is
export-time only: the `local` field is documented as "Export-only
overrides ... Ignored by the build and the shipped pnpmfile"
(`define-plugin.ts:42-46`).[^define-plugin-ts]

## Merge semantics

Applied by `applyLocalDirective(managed, raw, parsed, field)`
(`package/src/cli/local-merge.ts:48-82`):

| Form | Effect |
| --- | --- |
| Bare value (no directive wrapper) | Overwrite the managed value (`local-merge.ts:62-63`). |
| `{ value }` | Overwrite the managed value (`local-merge.ts:62-63`). |
| `{ strategy: "union", value }` | Record merge — `{ ...managed, ...value }`, `value` wins on key clash — or array set-union (`local-merge.ts:24-38`, `local-merge.ts:60-61`). |
| `{ strategy: "difference", value }` | Remove `value`'s keys from a managed record, or remove `value`'s elements from a managed array (`local-merge.ts:24-38`). |
| `{ strategy: "merge", value }` | Treated as `union` semantics (`local-merge.ts:59`). Used by `local.patchedDependencies` to upsert this plugin's owned keys while preserving unowned ones. |
| `{ strategy: "rewrite" }` | Passthrough at this layer — carries no `value`, so `result = managed` (`local-merge.ts:64-66`); the actual rewrite happens in the patch pipeline (see [patch-distribution](patch-distribution.md)). |
| `preserve` (overrides field only, applied after the above) | Copies back any entry from the existing file's `overrides` whose value string starts with `<proto>:` for a proto in the preserve list. Defaults to `DEFAULT_PRESERVE = ["file", "link", "workspace", "portal"]` when absent (`local-merge.ts:1-2`, `local-merge.ts:68-79`).[^local-merge-ts] |

## `isLocalDirective` detection rule

`isLocalDirective(v)` (`package/src/cli/local-merge.ts:13-17`) treats `v`
as the directive form when it is a non-array object whose keys are a
**non-empty subset** of `DIRECTIVE_KEYS = {"preserve", "value",
"strategy"}` (`local-merge.ts:4`). A real override record that happens to
use foreign keys — for example a hand-written `overrides` map with a
package named `preserve` or `value` mixed with other keys — is not
mistaken for a directive as long as it carries at least one key outside
that set; it is instead treated as a bare value.[^local-merge-ts]
