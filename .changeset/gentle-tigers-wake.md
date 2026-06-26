---
"rolldown-pnpm-config": minor
---

## Features

### 121 managed pnpm-workspace.yaml fields in `definePlugin`

`PluginConfig` now covers the complete published pnpm settings surface: 121 fields across 8 categories, up from 14 in the initial release. All 107 new fields are optional and additive — the 14 M1 fields (`catalogs`, `overrides`, `confirmModulesPurge`, `packageExtensions`, `allowedDeprecatedVersions`, `publicHoistPattern`, `minimumReleaseAgeExclude`, `supportedArchitectures`, `auditConfig`, `peerDependencyRules`, `strictDepBuilds`, `blockExoticSubdeps`, `minimumReleaseAge`, `allowBuilds`) behave identically to before.

New fields by category:

- **Dependency resolution and supply-chain / trust** (9): `ignoredOptionalDependencies`, `updateConfig`, `catalog`, `minimumReleaseAgeStrict`, `minimumReleaseAgeIgnoreMissingTime`, `trustPolicy`, `trustPolicyExclude`, `trustPolicyIgnoreAfter`, `trustLockfile`
- **Hoisting and node-modules** (17): `hoist`, `hoistWorkspacePackages`, `hoistPattern`, `shamefullyHoist`, `hoistingLimits`, `modulesDir`, `nodeLinker`, `symlink`, `enableModulesDir`, `virtualStoreDir`, `virtualStoreDirMaxLength`, `virtualStoreOnly`, `packageImportMethod`, `modulesCacheMaxAge`, `dlxCacheMaxAge`, `verifyStoreIntegrity`, `strictStorePkgContentCheck`
- **Lockfile and peers** (12): `lockfile`, `preferFrozenLockfile`, `lockfileIncludeTarballUrl`, `gitBranchLockfile`, `mergeGitBranchLockfilesBranchPattern`, `peersSuffixMaxLength`, `sharedWorkspaceLockfile`, `autoInstallPeers`, `dedupePeerDependents`, `dedupePeers`, `strictPeerDependencies`, `resolvePeersFromWorkspaceRoot`
- **Build, scripts, patches, and injection** (26): `onlyBuiltDependencies`, `onlyBuiltDependenciesFile`, `neverBuiltDependencies`, `ignoredBuiltDependencies`, `dangerouslyAllowAllBuilds`, `ignoreScripts`, `ignoreDepScripts`, `childConcurrency`, `sideEffectsCache`, `sideEffectsCacheReadonly`, `nodeOptions`, `verifyDepsBeforeRun`, `enablePrePostScripts`, `scriptShell`, `shellEmulator`, `requiredScripts`, `patchedDependencies`, `allowUnusedPatches`, `allowNonAppliedPatches`, `ignorePatchFailures`, `patchesDir`, `configDependencies`, `executionEnv`, `injectWorkspacePackages`, `syncInjectedDepsAfterScripts`, `dedupeInjectedDeps`
- **Package-manager and node-version policy** (8): `packageManagerStrict`, `packageManagerStrictVersion`, `managePackageManagerVersions`, `pmOnFail`, `runtimeOnFail`, `nodeVersion`, `useNodeVersion`, `nodeDownloadMirrors`
- **Catalog and workspace** (10): `catalogMode`, `cleanupUnusedCatalogs`, `linkWorkspacePackages`, `preferWorkspacePackages`, `saveWorkspaceProtocol`, `includeWorkspaceRoot`, `ignoreWorkspaceCycles`, `disallowWorkspaceCycles`, `workspaceConcurrency`, `auditLevel`
- **Resolution and misc preferences** (14): `resolutionMode`, `savePrefix`, `saveExact`, `tag`, `preferOffline`, `dedupeDirectDeps`, `deployAllFiles`, `forceLegacyDeploy`, `extendNodePath`, `preferSymlinkedExecutables`, `ignoreCompatibilityDb`, `optimisticRepeatInstall`, `recursiveInstall`, `engineStrict`
- **Network tuning and publish** (11): `networkConcurrency`, `fetchRetries`, `fetchRetryFactor`, `fetchRetryMintimeout`, `fetchRetryMaxtimeout`, `fetchTimeout`, `gitShallowHosts`, `provenance`, `gitChecks`, `embedReadme`, `publishBranch`

Security and supply-chain fields (`overrides`, `strictDepBuilds`, `blockExoticSubdeps`, `minimumReleaseAge`, `trustPolicy`, `trustLockfile`, and related) default to `enforcement: "warn"`. All others default to `enforcement: "absent"`. Authors can override per field using the `FieldInput<T>` wrapper (see below).

### `FieldInput<T>` and per-field enforcement

Every field on `PluginConfig` now accepts either a bare value or a `FieldInput` wrapper object that pairs the value with an explicit `enforcement` level:

```ts
import { definePlugin } from "rolldown-pnpm-config";

definePlugin({
  catalogs: { /* ... */ },
  overrides: {
    value: { "lodash@<4.0.0": "^4.17.21" },
    enforcement: "error",          // fails the install if the consumer diverges
  },
  publicHoistPattern: {
    value: ["*"],
    enforcement: "warn",           // prints a console warning box on divergence
    excludeByRepo: {
      "my-monorepo": ["@internal/*"],   // drop these patterns inside my-monorepo
    },
  },
  strictDepBuilds: {
    value: true,
    enforcement: "absent",         // silent merge, no warning (the default)
  },
});
```

The `Enforcement` type controls runtime behaviour when the consuming repo's local pnpm config diverges from the Silk-managed value:

- `"absent"` — silent merge; the local value wins without any warning (default for most fields)
- `"warn"` — prints a formatted override or security warning box to the console
- `"error"` — throws `EnforcementError`, which propagates out of `updateConfig` and fails the pnpm install

`EnforcementError` is a plain `Error` subclass (no Effect dependency) so it survives bundling into the emitted pnpmfile. It must not be swallowed by a catch-and-fall-back guard — code that wraps `updateConfig` should rethrow on `err instanceof EnforcementError`.

### Per-field config validation at build time

Each declared field is validated against its expected shape inside the Rolldown plugin at build time. A misconfigured field (wrong type, invalid structure) surfaces as a typed `ConfigError` with a descriptive message before any pnpmfile is emitted.

### Updated `createHooks` runtime contract

`rolldown-pnpm-config/runtime` now exports `createHooks(base, manifest)`. The two-argument form separates the frozen field values (`base`) from the field → strategy/enforcement descriptor map (`manifest`), matching the shape the build plugin emits into the generated pnpmfile.

New public types exported from `rolldown-pnpm-config` and `rolldown-pnpm-config/runtime`:

- `FieldInput<T>` — bare value or `{ value, enforcement }` wrapper; the authoring type for every `PluginConfig` field
- `Enforcement` — `"absent" | "warn" | "error"`
- `Base` — `Record<string, unknown>`; the frozen field-value map consumed by `createHooks`
- `Manifest` — `Record<string, ManifestEntry>`; the field → strategy descriptor map consumed by `createHooks`
- `ManifestEntry` — `{ strategy, enforcement, options? }`; one field's runtime descriptor
