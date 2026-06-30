# Required config `name` + de-silk the runtime — Design

Date: 2026-06-29
Status: Approved (brainstorm); pending implementation plan
Branch: `feat/ui-updates`
Area: `package/src/define-plugin.ts`, `package/src/plugin/` (freeze, serialize), `package/src/runtime/` (warnings, strategies, types)

## Problem

The library is generic, but the bundled `pnpmfile.mjs` still carries "silk" in
user-visible strings (warning box titles/body, the `detail` messages, and the
`Divergence.silkValue` property key). Separately, the bundled runtime cannot
identify which config dependency emitted a warning — it has no name of its own.

## Decisions (from brainstorming)

- Add a **required** top-level `name: string` to `PluginConfig`. It is metadata
  (never written to `pnpm-workspace.yaml`, not a descriptor field). `freeze`
  validates it and a missing/empty value is a `ConfigError`.
- Warnings use the **name as a prefix tag**: `[<name>]` is the first line of each
  warning box; titles/body become generic.
- Rename the divergence value fields: `silkValue → managedValue`,
  `childValue → localValue`.
- De-silk all bundle-visible strings; also reword source comments/locals
  (`silk` → `managed`/`base`, drop "Ports Silk" proper nouns).

## The `name` field

`package/src/define-plugin.ts` — add as a required member of `PluginConfig`:

```ts
/** Identifier for this config dependency, surfaced in runtime warnings.
 *  Conventionally the config package's npm name, e.g. "@acme/pnpm-config". @public */
readonly name: string;
```

- It is required, so the compile-time `PluginConfig` ↔ descriptor drift guard
  (`package/__test__/types/plugin-config.test-d.ts`) must treat `name` as a
  non-descriptor meta key, the same exception already made for `catalogs` and
  `local`. Verify and extend that guard's exclusion set.
- `freeze` (`package/src/plugin/freeze.ts`) validates `name` is a non-empty
  string before the field loop; on failure: `ConfigError({ message: "Config
  name is required" })` (or "must be a non-empty string"). `name` is NOT added
  to `base` or `manifest`; `freeze` returns it as a third member:
  `{ base, manifest, name }`.

## Threading name → warnings

Build time: `PnpmConfigPlugin` already runs `freeze`; `serialize.ts` emits the
pnpmfile virtual module. The module changes from `createHooks(base, manifest)`
to `createHooks(base, manifest, <name-literal>)`, where the literal is
`JSON.stringify(name)` (deterministic, like the existing sorted base/manifest).

Runtime: `createHooks(base, manifest, name)` (`package/src/runtime/index.ts`)
gains a `name: string` third parameter and passes it to the formatters:
`formatOverrideWarning(allOverrides, name)` and
`formatSecurityWarning(allSecurity, name)`. The runtime stays dependency-free;
it only carries the baked-in string.

## Warning wording (`package/src/runtime/warnings.ts`)

Both `formatOverrideWarning(divergences, name)` and
`formatSecurityWarning(divergences, name)` gain a `name` parameter and render
`[<name>]` as the first content line of the box, then generic copy:

- Override box: title `⚠️  CATALOG OVERRIDE DETECTED`; body `The following
  entries override managed versions:`; per entry `Managed version:` /
  `Local override:`; footer `Local versions will be used. To use the managed
  defaults, remove these entries from your pnpm-workspace.yaml.`
- Security box: title `⚠️  SECURITY OVERRIDE DETECTED`; body `The following
  entries weaken managed security defaults:`; per entry uses
  `<setting>: managed=<managedValue> -> local=<localValue>`.

Padding stays the existing `" ".repeat(Math.max(0, WARNING_BOX_WIDTH - len - 2))`
pattern; an over-long `name` simply doesn't pad (same pre-existing behavior as a
long catalog path). `WARNING_BOX_WIDTH` unchanged (75).

## Divergence rename

`package/src/runtime/types.ts` `Divergence`: `silkValue → managedValue`,
`childValue → localValue`. Update every producer and consumer:

- producers: `runtime/strategies/catalogs.ts`, `runtime/strategies/overrides.ts`,
  `runtime/strategies/scalar.ts` (each builds `Divergence` objects).
- consumer: `runtime/warnings.ts`.
- the `detail` strings lose "Silk": `"Local version overrides the managed
  version."` and `"Disables a security check the managed config enabled."`

## Source hygiene (not bundle-visible)

Rename internal `silk` locals to `managed`/`base` in the strategy files and
reword the "Ports Silk `X`" JSDoc comments in `ctx.ts`, `warnings.ts`,
`strategies/*.ts` to drop the proper noun (e.g. "Merges …" instead of "Ports
Silk merge-overrides.ts"). No behavior change.

## Breaking change: configs gain `name`

`name` is required, so add it to every typed config and fixture:

- `examples/rolldown/pnpm-config.ts`, `examples/rolldown/rolldown.config.ts`,
  `examples/savvy/savvy.build.ts` (and any example that calls
  `PnpmConfigPlugin`).
- `freeze` unit-test configs, `export.int`/`preview.int` test configs, and any
  `PluginConfig` literal in tests. (`upgrade`/`discover` tests parse source
  statically and do not freeze, so they only need `name` if the literal is
  type-checked.)

## Testing

- `freeze`: returns the provided `name`; rejects missing and empty-string `name`
  with `ConfigError`; `name` does not appear in `base`/`manifest`.
- `warnings`: both boxes render `[<name>]` and contain no "silk"/"Silk"
  (case-insensitive) in their output; `managed=`/`local=` wording present.
- `serialize`: the emitted pnpmfile module text calls
  `createHooks(base, manifest, "<name>")` with the name literal.
- `createHooks`: a divergence-producing config surfaces a warning carrying the
  name.
- strategy unit tests: updated for `managedValue`/`localValue` field names.
- de-silk guard: a test asserts the runtime warning/strategy outputs (rendered
  strings + `Divergence` keys) contain no "silk"/"Silk".
- the `PluginConfig` drift-guard type test still passes with `name` excluded.

## Out of scope

- Renaming user catalog names (e.g. a consumer's `catalogs: { silk: … }`) — that
  is the consumer's choice, not the library's.
- Surfacing `name` anywhere other than the runtime warnings.
- Any change to the `export`/`preview`/`upgrade` command behavior beyond the
  configs they read now requiring a `name`.
