---
type: Interface
title: Managed pnpm fields
description: The 110 pnpm settings fields this library manages, grouped by category, plus the keys deliberately excluded from coverage.
resource: ../../package/src/registry.ts
kind: config
generated:
  by: okfit/claude-code
  at: 2026-11-13T06:08:51Z
sources:
  - id: descriptors
    resource: package/src/registry.ts
  - id: settings-catalog
    resource: "npm:@effected/pnpm/settings"
tags:
  - architecture
integrity:
  generated:
    body: 513ae51d56862b76
---

# Managed pnpm fields

## What a consumer gets

A plugin author declaring any of these 110 fields on `PnpmConfigPlugin({...})`
gets it validated, merged with the consuming repo's local config by a named
strategy, and enforced at the level shown, at install time. This is the
coverage promise; the enumeration below is the point of this document, and
is grounded directly in the policy table `FIELD_REGISTRY` in `package/src/registry.ts`, one row per entry; each field's kind (and its schema) is the pnpm 12 settings catalog's, from `@effected/pnpm/settings`.[^settings-catalog] The per-heading counts sum to 24+17+12+18+4+10+14+11 = 110.[^descriptors]

For what a pnpm setting means, see [pnpm settings](../references/pnpm-settings.md).
Every field here is one pnpm 12 reads; settings no pnpm reads, pnpm 11's `confirmModulesPurge`, and the five build settings pnpm 12 accepts but never applies are not offered, and a config naming one fails the build. A pnpm 12 setting not listed here fails the build too (`is a pnpm 12 setting this plugin does not manage`) rather than shipping nowhere.

## Resolution — 24 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `catalogs` | stringRecordRecord | `catalogs` | warn |
| `packageExtensions` | unknownRecord | `mapChildWins` | absent |
| `allowedDeprecatedVersions` | stringRecord | `mapChildWins` | absent |
| `publicHoistPattern` | stringArray | `arrayUnion` | absent |
| `minimumReleaseAgeExclude` | stringArray | `arrayUnion` | absent |
| `supportedArchitectures` | object | `arrayRecordUnion` | absent |
| `audit` | object | `mapChildWins` | absent |
| `auditConfig` | object | `arrayRecordUnion` | absent |
| `overrides` | stringRecord | `overrides` | warn |
| `peerDependencyRules` | object | `peerDependencyRules` | warn |
| `strictDepBuilds` | boolean | `securityFlag` | warn |
| `blockExoticSubdeps` | boolean | `securityFlag` | warn |
| `minimumReleaseAge` | number | `securityMin` | warn |
| `allowBuilds` | booleanRecord | `allowBuilds` | warn |
| `ignoredOptionalDependencies` | stringArray | `arrayUnion` | absent |
| `update` | object | `mapChildWins` | absent |
| `updateConfig` | object | `mapChildWins` | absent |
| `catalog` | stringRecord | `mapChildWins` | warn |
| `minimumReleaseAgeStrict` | boolean | `scalar` | warn |
| `minimumReleaseAgeIgnoreMissingTime` | boolean | `scalar` | warn |
| `trustPolicy` | enum | `scalar` | warn |
| `trustPolicyExclude` | stringArray | `arrayUnion` | warn |
| `trustPolicyIgnoreAfter` | number | `scalar` | warn |
| `trustLockfile` | boolean | `scalar` | warn |

`peerDependencyRules` additionally supports an authoring-layer
`allowedVersionsFromCatalogs` directive — a `{ catalog, peer, prefix? }`
(or array) input that `freeze` resolves against the declared catalogs
into version-qualified `allowedVersions` rules and strips before schema
validation, baking the result into `base`. This is layered on top of the
field by `package/src/plugin/allowed-versions.ts`; the policy row
above is unchanged.[^descriptors]

`overrides` has the same kind of companion in the top-level
`overridesFromCatalogs` directive — a `{ catalog, include?, exclude?, scope? }` (or
array) input that `freeze` resolves into one `"<name>@^X.0.0": "X.Y.Z"`
entry per simple-range member of the catalog (`^0.Y.0` on a 0.x line,
`~0.0.0` on a 0.0.x one, the bare name under `scope: "any"`), merging the authored `overrides` over the
result so a hand-written selector wins. Prerelease and compound-range
members are skipped, never widened. `include` and `exclude` take exact
names or glob patterns (`@effect/*`); `exclude` wins on overlap, and an
entry matching no member (or an empty `include`) throws. Layered on by
`package/src/plugin/overrides-from-catalogs.ts`; the policy row is
unchanged.

## Hoisting — 17 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `hoist` | boolean | `scalar` | absent |
| `hoistWorkspacePackages` | boolean | `scalar` | absent |
| `hoistPattern` | stringArray | `arrayUnion` | absent |
| `shamefullyHoist` | boolean | `scalar` | absent |
| `hoistingLimits` | enum | `scalar` | absent |
| `modulesDir` | string | `scalar` | absent |
| `nodeLinker` | union | `scalar` | absent |
| `symlink` | boolean | `scalar` | absent |
| `enableModulesDir` | boolean | `scalar` | absent |
| `virtualStoreDir` | string | `scalar` | absent |
| `virtualStoreDirMaxLength` | number | `scalar` | absent |
| `virtualStoreOnly` | boolean | `scalar` | absent |
| `packageImportMethod` | enum | `scalar` | absent |
| `modulesCacheMaxAge` | number | `scalar` | absent |
| `dlxCacheMaxAge` | number | `scalar` | absent |
| `verifyStoreIntegrity` | boolean | `scalar` | warn |
| `strictStorePkgContentCheck` | boolean | `scalar` | warn |

## Lockfile — 12 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `lockfile` | union | `scalar` | absent |
| `preferFrozenLockfile` | boolean | `scalar` | absent |
| `lockfileIncludeTarballUrl` | boolean | `scalar` | absent |
| `gitBranchLockfile` | boolean | `scalar` | absent |
| `mergeGitBranchLockfilesBranchPattern` | stringArray | `arrayUnion` | absent |
| `peersSuffixMaxLength` | number | `scalar` | absent |
| `sharedWorkspaceLockfile` | boolean | `scalar` | absent |
| `autoInstallPeers` | boolean | `scalar` | absent |
| `dedupePeerDependents` | boolean | `scalar` | absent |
| `dedupePeers` | boolean | `scalar` | absent |
| `strictPeerDependencies` | boolean | `scalar` | absent |
| `resolvePeersFromWorkspaceRoot` | boolean | `scalar` | absent |

## Build — 18 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `dangerouslyAllowAllBuilds` | boolean | `scalar` | warn |
| `ignoreScripts` | boolean | `scalar` | absent |
| `childConcurrency` | number | `scalar` | absent |
| `sideEffectsCache` | union | `scalar` | absent |
| `sideEffectsCacheReadonly` | boolean | `scalar` | absent |
| `nodeOptions` | string | `scalar` | absent |
| `verifyDepsBeforeRun` | union | `scalar` | absent |
| `enablePrePostScripts` | boolean | `scalar` | absent |
| `scriptShell` | string | `scalar` | absent |
| `shellEmulator` | boolean | `scalar` | absent |
| `requiredScripts` | stringArray | `arrayUnion` | absent |
| `patchedDependencies` | stringRecord | `mapChildWins` | warn |
| `allowUnusedPatches` | boolean | `scalar` | absent |
| `patchesDir` | string | `scalar` | absent |
| `configDependencies` | unknownRecord | `mapChildWins` | absent |
| `injectWorkspacePackages` | boolean | `scalar` | absent |
| `syncInjectedDepsAfterScripts` | stringArray | `arrayUnion` | absent |
| `dedupeInjectedDeps` | boolean | `scalar` | absent |

`patchedDependencies` additionally supports authoring-layer patch
discovery and path rewrite — a `{ strategy: "rewrite" }` input discovers
`public/patches/` and rewrites each entry to a distributed
`node_modules/.pnpm-config/<name>/<rel>` path baked into `base`. This is
layered on top of the field by `package/src/patches/`; the policy row
above is unchanged. `patchesDir` stays `absent`/unmanaged and is never
read by the patch code.[^descriptors]

## Runtime config — 4 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `pmOnFail` | enum | `scalar` | absent |
| `runtimeOnFail` | enum | `scalar` | absent |
| `nodeVersion` | string | `scalar` | absent |
| `nodeDownloadMirrors` | stringRecord | `mapChildWins` | absent |

## Workspace — 10 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `catalogMode` | enum | `scalar` | absent |
| `cleanupUnusedCatalogs` | boolean | `scalar` | absent |
| `linkWorkspacePackages` | union | `scalar` | absent |
| `preferWorkspacePackages` | boolean | `scalar` | absent |
| `saveWorkspaceProtocol` | union | `scalar` | absent |
| `includeWorkspaceRoot` | boolean | `scalar` | absent |
| `ignoreWorkspaceCycles` | boolean | `scalar` | absent |
| `disallowWorkspaceCycles` | boolean | `scalar` | absent |
| `workspaceConcurrency` | number | `scalar` | absent |
| `auditLevel` | enum | `scalar` | absent |

## Misc preferences — 14 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `resolutionMode` | enum | `scalar` | absent |
| `savePrefix` | string | `scalar` | absent |
| `saveExact` | boolean | `scalar` | absent |
| `tag` | string | `scalar` | absent |
| `preferOffline` | boolean | `scalar` | absent |
| `dedupeDirectDeps` | boolean | `scalar` | absent |
| `deployAllFiles` | boolean | `scalar` | absent |
| `forceLegacyDeploy` | boolean | `scalar` | absent |
| `extendNodePath` | boolean | `scalar` | absent |
| `preferSymlinkedExecutables` | boolean | `scalar` | absent |
| `ignoreCompatibilityDb` | boolean | `scalar` | absent |
| `optimisticRepeatInstall` | boolean | `scalar` | absent |
| `recursiveInstall` | boolean | `scalar` | absent |
| `engineStrict` | boolean | `scalar` | absent |

## Network and publish — 11 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `networkConcurrency` | number | `scalar` | absent |
| `fetchRetries` | number | `scalar` | absent |
| `fetchRetryFactor` | number | `scalar` | absent |
| `fetchRetryMintimeout` | number | `scalar` | absent |
| `fetchRetryMaxtimeout` | number | `scalar` | absent |
| `fetchTimeout` | number | `scalar` | absent |
| `gitShallowHosts` | stringArray | `arrayUnion` | absent |
| `provenance` | boolean | `scalar` | absent |
| `gitChecks` | boolean | `scalar` | absent |
| `embedReadme` | boolean | `scalar` | absent |
| `publishBranch` | string | `scalar` | absent |

## Not covered

Keys deliberately excluded from the policy table — present in
[pnpm settings](../references/pnpm-settings.md) but absent from every
the policy table in `package/src/registry.ts`[^descriptors] — with the
classification reason:

| key(s) | reason |
| --- | --- |
| `packages` | workspace package globs, not a tunable setting (managed separately) |
| `registry`, `registries`, `registrySupportsTimeField` | registry config (machine/org-specific) |
| `ca`, `cafile`, `cert`, `key` | TLS material (machine/secret) |
| `proxy`, `httpsProxy`, `noproxy`, `localAddress`, `maxsockets`, `strictSsl` | proxy / network transport (machine-specific) |
| `color`, `loglevel`, `reporter`, `useStderr`, `updateNotifier`, `useBetaCli` | CLI / reporter / user-env output |
| `npmPath`, `npmrcAuthFile` | external tool path / auth file (machine-specific) |
| `storeDir`, `cacheDir`, `stateDir`, `globalDir`, `globalBinDir` | filesystem locations (machine-specific) |
| `pnpmfile`, `globalPnpmfile`, `ignorePnpmfile` | pnpmfile meta (self-referential to this plugin) |
| `unsafePerm` | UID/GID switching (machine/privilege) |
| `ignoreWorkspaceRootCheck`, `failIfNoMatch` | CLI invocation behavior |
| `enableGlobalVirtualStore`, `nodeExperimentalPackageMap`, `nodePackageMapType`, `useRunningStoreServer`, `frozenStore` | experimental / niche-daemon flags |

## What is not part of the promise

The maintainer-side shape of a policy entry (`strategy` and `enforcement`, laid over the catalog's facts) is documented in [field-policy](../models/field-policy.md), not here; this document is the consumer-facing coverage promise only.

[^descriptors]: descriptors

[^settings-catalog]: settings-catalog
