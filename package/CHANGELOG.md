# rolldown-pnpm-config

## 0.1.0

### Features

* [`2985f81`](https://github.com/spencerbeggs/pnpm-module-template/commit/2985f81a248eec9dd4524d9d2f961ff583fe4a7f) ### Full pnpm field support in `definePlugin`

`definePlugin` now accepts the complete set of pnpm fields that Silk manages, well beyond the M1 `catalogs`-only surface. Newly supported fields on `PluginConfig`:

* `confirmModulesPurge` — whether pnpm prompts before purging `node_modules`
* `packageExtensions` — per-package manifest overrides merged into the dependency graph
* `allowedDeprecatedVersions` — deprecated versions explicitly allowed, keyed by package
* `publicHoistPattern` — glob patterns hoisted to the root `node_modules`; accepts an optional `excludeByRepo` map to drop specific patterns when installed inside a named consuming repo
* `minimumReleaseAgeExclude` — packages excluded from the minimum-release-age quarantine
* `supportedArchitectures` — supported architectures keyed by axis (`os` / `cpu` / `libc`)
* `auditConfig` — audit exclusions keyed by axis (`ignoreGhsas` / `ignoreCves`)
* `overrides` — security version overrides keyed by package selector
* `peerDependencyRules` — peer dependency rules: `allowedVersions`, `ignoreMissing`, `allowAny`
* `strictDepBuilds` — whether dependency build scripts are blocked unless explicitly allowed
* `blockExoticSubdeps` — whether exotic (non-registry) subdependencies are blocked
* `minimumReleaseAge` — minimum age in minutes a release must reach before it is installable
* `allowBuilds` — packages whose build scripts are explicitly allowed to run

### `FieldInput<T>` and per-field enforcement

Every field on `PluginConfig` now accepts either a bare value or a `FieldInput` wrapper object that pairs the value with an explicit `enforcement` level:

```ts
import { definePlugin } from "rolldown-pnpm-config";

definePlugin({
  catalogs: {
    /* ... */
  },
  overrides: {
    value: { "lodash@<4.0.0": "^4.17.21" },
    enforcement: "error", // fails the install if the consumer diverges
  },
  publicHoistPattern: {
    value: ["*"],
    enforcement: "warn", // prints a console warning box on divergence
    excludeByRepo: {
      "my-monorepo": ["@internal/*"], // drop these patterns inside my-monorepo
    },
  },
  strictDepBuilds: {
    value: true,
    enforcement: "absent", // silent merge, no warning (the default)
  },
});
```

The `Enforcement` type controls runtime behaviour when the consuming repo's local pnpm config diverges from the Silk-managed value:

* `"absent"` — silent merge; the local value wins without any warning (default for most fields)
* `"warn"` — prints a formatted override or security warning box to the console
* `"error"` — throws `EnforcementError`, which propagates out of `updateConfig` and fails the pnpm install

`EnforcementError` is a plain `Error` subclass (no Effect dependency) so it survives bundling into the emitted pnpmfile. It must not be swallowed by a catch-and-fall-back guard — code that wraps `updateConfig` should rethrow on `err instanceof EnforcementError`.

### Per-field config validation at build time

Each declared field is validated against its expected shape inside the Rolldown plugin at build time. A misconfigured field (wrong type, invalid structure) surfaces as a typed `ConfigError` with a descriptive message before any pnpmfile is emitted.

### Updated `createHooks` runtime contract

`rolldown-pnpm-config/runtime` now exports `createHooks(base, manifest)`. The two-argument form separates the frozen field values (`base`) from the field → strategy/enforcement descriptor map (`manifest`), matching the shape the build plugin emits into the generated pnpmfile.

New public types exported from `rolldown-pnpm-config` and `rolldown-pnpm-config/runtime`:

* `FieldInput<T>` — bare value or `{ value, enforcement }` wrapper; the authoring type for every `PluginConfig` field
* `Enforcement` — `"absent" | "warn" | "error"`
* `Base` — `Record<string, unknown>`; the frozen field-value map consumed by `createHooks`
* `Manifest` — `Record<string, ManifestEntry>`; the field → strategy descriptor map consumed by `createHooks`
* `ManifestEntry` — `{ strategy, enforcement, options? }`; one field's runtime descriptor
