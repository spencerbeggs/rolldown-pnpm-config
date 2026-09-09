---
type: Interface
title: Managed pnpm fields
description: The 121 pnpm settings fields this library manages, grouped by category, plus the keys deliberately excluded from coverage.
resource: ../../package/src/descriptors/index.ts
kind: config
generated:
  by: okfit/claude-code
  at: 2026-09-09T06:03:08Z
sources:
  - id: descriptors
    resource: package/src/descriptors
tags:
  - architecture
---

# Managed pnpm fields

## What a consumer gets

A plugin author declaring any of these 121 fields on `PnpmConfigPlugin({...})`
gets it validated, merged with the consuming repo's local config by a named
strategy, and enforced at the level shown, at install time. This is the
coverage promise; the enumeration below is the point of this document, and
is grounded directly in `package/src/descriptors/`, one table row per
descriptor entry. Field counts were verified directly against
`package/src/descriptors/*.ts` (one entry per top-level key, category
module noted in each heading below): 23 + 17 + 12 + 26 + 8 + 10 + 14 + 11
= 121.[^descriptors]

For what a pnpm setting means, and which source wins when `pnpm.io` and
the schemastore JSON Schema disagree, see
[pnpm settings](../references/pnpm-settings.md) — including the note
there that `confirmModulesPurge` is a real, working boolean setting this
repository's descriptor table and tests exercise, absent from both
external sources.

## Resolution (`resolution.ts`) — 23 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `catalogs` | object | `catalogs` | warn |
| `confirmModulesPurge` | boolean | `scalar` | absent |
| `packageExtensions` | unknownRecord | `mapChildWins` | absent |
| `allowedDeprecatedVersions` | stringRecord | `mapChildWins` | absent |
| `publicHoistPattern` | stringArray | `arrayUnion` | absent |
| `minimumReleaseAgeExclude` | stringArray | `arrayUnion` | absent |
| `supportedArchitectures` | stringArrayRecord | `arrayRecordUnion` | absent |
| `auditConfig` | stringArrayRecord | `arrayRecordUnion` | absent |
| `overrides` | stringRecord | `overrides` | warn |
| `peerDependencyRules` | object | `peerDependencyRules` | warn |
| `strictDepBuilds` | boolean | `securityFlag` | warn |
| `blockExoticSubdeps` | boolean | `securityFlag` | warn |
| `minimumReleaseAge` | number | `securityMin` | warn |
| `allowBuilds` | booleanRecord | `allowBuilds` | warn |
| `ignoredOptionalDependencies` | stringArray | `arrayUnion` | absent |
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
field by `package/src/plugin/allowed-versions.ts`; the descriptor row
above is unchanged.[^descriptors]

## Hoisting (`hoisting.ts`) — 17 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `hoist` | boolean | `scalar` | absent |
| `hoistWorkspacePackages` | boolean | `scalar` | absent |
| `hoistPattern` | stringArray | `arrayUnion` | absent |
| `shamefullyHoist` | boolean | `scalar` | absent |
| `hoistingLimits` | enum | `scalar` | absent |
| `modulesDir` | string | `scalar` | absent |
| `nodeLinker` | enum | `scalar` | absent |
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

## Lockfile (`lockfile.ts`) — 12 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `lockfile` | boolean | `scalar` | absent |
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

## Build (`build.ts`) — 26 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `onlyBuiltDependencies` | stringArray | `arrayUnion` | warn |
| `onlyBuiltDependenciesFile` | string | `scalar` | warn |
| `neverBuiltDependencies` | stringArray | `arrayUnion` | absent |
| `ignoredBuiltDependencies` | stringArray | `arrayUnion` | absent |
| `dangerouslyAllowAllBuilds` | boolean | `scalar` | warn |
| `ignoreScripts` | boolean | `scalar` | absent |
| `ignoreDepScripts` | boolean | `scalar` | absent |
| `childConcurrency` | number | `scalar` | absent |
| `sideEffectsCache` | boolean | `scalar` | absent |
| `sideEffectsCacheReadonly` | boolean | `scalar` | absent |
| `nodeOptions` | string | `scalar` | absent |
| `verifyDepsBeforeRun` | union | `scalar` | absent |
| `enablePrePostScripts` | boolean | `scalar` | absent |
| `scriptShell` | string | `scalar` | absent |
| `shellEmulator` | boolean | `scalar` | absent |
| `requiredScripts` | stringArray | `arrayUnion` | absent |
| `patchedDependencies` | stringRecord | `mapChildWins` | warn |
| `allowUnusedPatches` | boolean | `scalar` | absent |
| `allowNonAppliedPatches` | boolean | `scalar` | absent |
| `ignorePatchFailures` | boolean | `scalar` | absent |
| `patchesDir` | string | `scalar` | absent |
| `configDependencies` | stringRecord | `mapChildWins` | absent |
| `executionEnv` | unknownRecord | `mapChildWins` | absent |
| `injectWorkspacePackages` | boolean | `scalar` | absent |
| `syncInjectedDepsAfterScripts` | stringArray | `arrayUnion` | absent |
| `dedupeInjectedDeps` | boolean | `scalar` | absent |

`patchedDependencies` additionally supports authoring-layer patch
discovery and path rewrite — a `{ strategy: "rewrite" }` input discovers
`public/patches/` and rewrites each entry to a distributed
`node_modules/.pnpm-config/<name>/<rel>` path baked into `base`. This is
layered on top of the field by `package/src/patches/`; the descriptor row
above is unchanged. `patchesDir` stays `absent`/unmanaged and is never
read by the patch code.[^descriptors]

## Runtime config (`runtime-cfg.ts`) — 8 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `packageManagerStrict` | boolean | `scalar` | absent |
| `packageManagerStrictVersion` | boolean | `scalar` | absent |
| `managePackageManagerVersions` | boolean | `scalar` | absent |
| `pmOnFail` | enum | `scalar` | absent |
| `runtimeOnFail` | enum | `scalar` | absent |
| `nodeVersion` | string | `scalar` | absent |
| `useNodeVersion` | string | `scalar` | absent |
| `nodeDownloadMirrors` | unknownRecord | `mapChildWins` | absent |

## Workspace (`workspace.ts`) — 10 fields

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

## Misc preferences (`misc.ts`) — 14 fields

| key | kind | strategy | enforcement |
| --- | --- | --- | --- |
| `resolutionMode` | enum | `scalar` | absent |
| `savePrefix` | enum | `scalar` | absent |
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

## Network and publish (`network.ts`) — 11 fields

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

Keys deliberately excluded from the descriptor table — present in
[pnpm settings](../references/pnpm-settings.md) but absent from every
category module under `package/src/descriptors/`[^descriptors] — with the
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

The maintainer-side shape of a descriptor entry — `schema`, `doc`,
`workspaceYaml`, `anchor`, `options`, `samples` — and how these 121
entries are authored, merged, and derived from is documented in
[descriptor-table](../models/descriptor-table.md), not here; this document
is the consumer-facing coverage promise only.

[^descriptors]: descriptors
