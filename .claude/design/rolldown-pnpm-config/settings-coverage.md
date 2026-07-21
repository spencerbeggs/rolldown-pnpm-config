---
status: current
module: rolldown-pnpm-config
category: architecture
created: 2026-06-26
updated: 2026-07-21
last-synced: 2026-07-21
completeness: 95
related:
  - architecture.md
  - export-cli.md
  - specs/2026-06-26-pnpm-settings-coverage-design.md
  - specs/2026-06-30-patch-distribution-design.md
dependencies: []
---

# pnpm Settings Coverage Matrix

> **Source:** this matrix is generated from the live descriptor table at
> `package/src/descriptors/` and must be updated whenever that table changes.
> The schemastore JSON schema (`schemastore.org/pnpm-workspace.json`) may lag
> pnpm releases; `pnpm.io/settings` is authoritative on any conflict. The field
> `confirmModulesPurge` is a real boolean setting that is undocumented on
> `pnpm.io` and absent from schemastore; it is carried over from the Silk parity
> set and has no anchor link.

## Covered (121 fields)

Fields are grouped by their source descriptor module. The `kind` column reflects
the `kind` property on each descriptor entry. The `anchor` column links to
`https://pnpm.io/settings#<anchor>` using the `anchor` value from the
descriptor (all lowercased; any normalisations are noted below the table).

### Resolution (`resolution.ts`) — 23 fields

| key | kind | strategy | enforcement | anchor |
| --- | --- | --- | --- | --- |
| `catalogs` | object | `catalogs` | warn | [catalogs](https://pnpm.io/settings#catalogs) |
| `confirmModulesPurge` | boolean | `scalar` | absent | undocumented upstream |
| `packageExtensions` | unknownRecord | `mapChildWins` | absent | [packageExtensions](https://pnpm.io/settings#packageextensions) |
| `allowedDeprecatedVersions` | stringRecord | `mapChildWins` | absent | [allowedDeprecatedVersions](https://pnpm.io/settings#alloweddeprecatedversions) |
| `publicHoistPattern` | stringArray | `arrayUnion` | absent | [publicHoistPattern](https://pnpm.io/settings#publichoistpattern) |
| `minimumReleaseAgeExclude` | stringArray | `arrayUnion` | absent | [minimumReleaseAgeExclude](https://pnpm.io/settings#minimumreleaseageexclude) |
| `supportedArchitectures` | stringArrayRecord | `arrayRecordUnion` | absent | [supportedArchitectures](https://pnpm.io/settings#supportedarchitectures) |
| `auditConfig` | stringArrayRecord | `arrayRecordUnion` | absent | [auditConfig](https://pnpm.io/settings#auditconfig) |
| `overrides` | stringRecord | `overrides` | warn | [overrides](https://pnpm.io/settings#overrides) |
| `peerDependencyRules` | object | `peerDependencyRules` | warn | [peerDependencyRules](https://pnpm.io/settings#peerdependencyrules) |
| `strictDepBuilds` | boolean | `securityFlag` | warn | [strictDepBuilds](https://pnpm.io/settings#strictdepbuilds) |
| `blockExoticSubdeps` | boolean | `securityFlag` | warn | [blockExoticSubdeps](https://pnpm.io/settings#blockexoticsubdeps) |
| `minimumReleaseAge` | number | `securityMin` | warn | [minimumReleaseAge](https://pnpm.io/settings#minimumreleaseage) |
| `allowBuilds` | booleanRecord | `allowBuilds` | warn | [allowBuilds](https://pnpm.io/settings#allowbuilds) |
| `ignoredOptionalDependencies` | stringArray | `arrayUnion` | absent | [ignoredOptionalDependencies](https://pnpm.io/settings#ignoredoptionaldependencies) |
| `updateConfig` | object | `mapChildWins` | absent | [updateConfig](https://pnpm.io/settings#updateconfig) |
| `catalog` | stringRecord | `mapChildWins` | warn | [catalog](https://pnpm.io/settings#catalog) |
| `minimumReleaseAgeStrict` | boolean | `scalar` | warn | [minimumReleaseAgeStrict](https://pnpm.io/settings#minimumreleaseagestrict) |
| `minimumReleaseAgeIgnoreMissingTime` | boolean | `scalar` | warn | [minimumReleaseAgeIgnoreMissingTime](https://pnpm.io/settings#minimumreleaseageignoremissingtime) |
| `trustPolicy` | enum | `scalar` | warn | [trustPolicy](https://pnpm.io/settings#trustpolicy) |
| `trustPolicyExclude` | stringArray | `arrayUnion` | warn | [trustPolicyExclude](https://pnpm.io/settings#trustpolicyexclude) |
| `trustPolicyIgnoreAfter` | number | `scalar` | warn | [trustPolicyIgnoreAfter](https://pnpm.io/settings#trustpolicyignoreafter) |
| `trustLockfile` | boolean | `scalar` | warn | [trustLockfile](https://pnpm.io/settings#trustlockfile) |

`peerDependencyRules` additionally supports an authoring-layer `allowedVersionsFromCatalogs` directive (the `#40` work) — a `{ catalog, peer, prefix? }` (or array) input that `freeze` resolves against the declared catalogs into version-qualified `allowedVersions` rules and strips before schema validation, baking the result into `base`. This is layered on top of the field by `package/src/plugin/allowed-versions.ts`; the descriptor row above is unchanged (`object`/`peerDependencyRules`/`warn`). See [architecture.md](architecture.md).

### Hoisting (`hoisting.ts`) — 17 fields

| key | kind | strategy | enforcement | anchor |
| --- | --- | --- | --- | --- |
| `hoist` | boolean | `scalar` | absent | [hoist](https://pnpm.io/settings#hoist) |
| `hoistWorkspacePackages` | boolean | `scalar` | absent | [hoistWorkspacePackages](https://pnpm.io/settings#hoistworkspacepackages) |
| `hoistPattern` | stringArray | `arrayUnion` | absent | [hoistPattern](https://pnpm.io/settings#hoistpattern) |
| `shamefullyHoist` | boolean | `scalar` | absent | [shamefullyHoist](https://pnpm.io/settings#shamefullyhoist) |
| `hoistingLimits` | enum | `scalar` | absent | [hoistingLimits](https://pnpm.io/settings#hoistinglimits) |
| `modulesDir` | string | `scalar` | absent | [modulesDir](https://pnpm.io/settings#modulesdir) |
| `nodeLinker` | enum | `scalar` | absent | [nodeLinker](https://pnpm.io/settings#nodelinker) |
| `symlink` | boolean | `scalar` | absent | [symlink](https://pnpm.io/settings#symlink) |
| `enableModulesDir` | boolean | `scalar` | absent | [enableModulesDir](https://pnpm.io/settings#enablemodulesdir) |
| `virtualStoreDir` | string | `scalar` | absent | [virtualStoreDir](https://pnpm.io/settings#virtualstoredir) |
| `virtualStoreDirMaxLength` | number | `scalar` | absent | [virtualStoreDirMaxLength](https://pnpm.io/settings#virtualstoredirmaxlength) |
| `virtualStoreOnly` | boolean | `scalar` | absent | [virtualStoreOnly](https://pnpm.io/settings#virtualstoreonly) |
| `packageImportMethod` | enum | `scalar` | absent | [packageImportMethod](https://pnpm.io/settings#packageimportmethod) |
| `modulesCacheMaxAge` | number | `scalar` | absent | [modulesCacheMaxAge](https://pnpm.io/settings#modulescachemaxage) |
| `dlxCacheMaxAge` | number | `scalar` | absent | [dlxCacheMaxAge](https://pnpm.io/settings#dlxcachemaxage) |
| `verifyStoreIntegrity` | boolean | `scalar` | warn | [verifyStoreIntegrity](https://pnpm.io/settings#verifystoreintegrity) |
| `strictStorePkgContentCheck` | boolean | `scalar` | warn | [strictStorePkgContentCheck](https://pnpm.io/settings#strictstorepkgcontentcheck) |

### Lockfile (`lockfile.ts`) — 12 fields

| key | kind | strategy | enforcement | anchor |
| --- | --- | --- | --- | --- |
| `lockfile` | boolean | `scalar` | absent | [lockfile](https://pnpm.io/settings#lockfile) |
| `preferFrozenLockfile` | boolean | `scalar` | absent | [preferFrozenLockfile](https://pnpm.io/settings#preferfrozenlockfile) |
| `lockfileIncludeTarballUrl` | boolean | `scalar` | absent | [lockfileIncludeTarballUrl](https://pnpm.io/settings#lockfileincludetarballurl) |
| `gitBranchLockfile` | boolean | `scalar` | absent | [gitBranchLockfile](https://pnpm.io/settings#gitbranchlockfile) |
| `mergeGitBranchLockfilesBranchPattern` | stringArray | `arrayUnion` | absent | [mergeGitBranchLockfilesBranchPattern](https://pnpm.io/settings#mergegitbranchlockfilesbranchpattern) |
| `peersSuffixMaxLength` | number | `scalar` | absent | [peersSuffixMaxLength](https://pnpm.io/settings#peerssuffixmaxlength) |
| `sharedWorkspaceLockfile` | boolean | `scalar` | absent | [sharedWorkspaceLockfile](https://pnpm.io/settings#sharedworkspacelockfile) |
| `autoInstallPeers` | boolean | `scalar` | absent | [autoInstallPeers](https://pnpm.io/settings#autoinstallpeers) |
| `dedupePeerDependents` | boolean | `scalar` | absent | [dedupePeerDependents](https://pnpm.io/settings#dedupepeerdependents) |
| `dedupePeers` | boolean | `scalar` | absent | [dedupePeers](https://pnpm.io/settings#dedupepeers) |
| `strictPeerDependencies` | boolean | `scalar` | absent | [strictPeerDependencies](https://pnpm.io/settings#strictpeerdependencies) |
| `resolvePeersFromWorkspaceRoot` | boolean | `scalar` | absent | [resolvePeersFromWorkspaceRoot](https://pnpm.io/settings#resolvepeersfromworkspaceroot) |

### Build (`build.ts`) — 26 fields

| key | kind | strategy | enforcement | anchor |
| --- | --- | --- | --- | --- |
| `onlyBuiltDependencies` | stringArray | `arrayUnion` | warn | [onlyBuiltDependencies](https://pnpm.io/settings#onlybuiltdependencies) |
| `onlyBuiltDependenciesFile` | string | `scalar` | warn | [onlyBuiltDependenciesFile](https://pnpm.io/settings#onlybuiltdependenciesfile) |
| `neverBuiltDependencies` | stringArray | `arrayUnion` | absent | [neverBuiltDependencies](https://pnpm.io/settings#neverbuiltdependencies) |
| `ignoredBuiltDependencies` | stringArray | `arrayUnion` | absent | [ignoredBuiltDependencies](https://pnpm.io/settings#ignoredbuiltdependencies) |
| `dangerouslyAllowAllBuilds` | boolean | `scalar` | warn | [dangerouslyAllowAllBuilds](https://pnpm.io/settings#dangerouslyallowallbuilds) |
| `ignoreScripts` | boolean | `scalar` | absent | [ignoreScripts](https://pnpm.io/settings#ignorescripts) |
| `ignoreDepScripts` | boolean | `scalar` | absent | [ignoreDepScripts](https://pnpm.io/settings#ignoredepscripts) |
| `childConcurrency` | number | `scalar` | absent | [childConcurrency](https://pnpm.io/settings#childconcurrency) |
| `sideEffectsCache` | boolean | `scalar` | absent | [sideEffectsCache](https://pnpm.io/settings#sideeffectscache) |
| `sideEffectsCacheReadonly` | boolean | `scalar` | absent | [sideEffectsCacheReadonly](https://pnpm.io/settings#sideeffectscachereadonly) |
| `nodeOptions` | string | `scalar` | absent | [nodeOptions](https://pnpm.io/settings#nodeoptions) |
| `verifyDepsBeforeRun` | union | `scalar` | absent | [verifyDepsBeforeRun](https://pnpm.io/settings#verifydepsbeforerun) |
| `enablePrePostScripts` | boolean | `scalar` | absent | [enablePrePostScripts](https://pnpm.io/settings#enableprepostscripts) |
| `scriptShell` | string | `scalar` | absent | [scriptShell](https://pnpm.io/settings#scriptshell) |
| `shellEmulator` | boolean | `scalar` | absent | [shellEmulator](https://pnpm.io/settings#shellemulator) |
| `requiredScripts` | stringArray | `arrayUnion` | absent | [requiredScripts](https://pnpm.io/settings#requiredscripts) |
| `patchedDependencies` | stringRecord | `mapChildWins` | warn | [patchedDependencies](https://pnpm.io/settings#patcheddependencies) |
| `allowUnusedPatches` | boolean | `scalar` | absent | [allowUnusedPatches](https://pnpm.io/settings#allowunusedpatches) |
| `allowNonAppliedPatches` | boolean | `scalar` | absent | [allowNonAppliedPatches](https://pnpm.io/settings#allownonappliedpatches) |
| `ignorePatchFailures` | boolean | `scalar` | absent | [ignorePatchFailures](https://pnpm.io/settings#ignorepatchfailures) |
| `patchesDir` | string | `scalar` | absent | [patchesDir](https://pnpm.io/settings#patchesdir) |
| `configDependencies` | stringRecord | `mapChildWins` | absent | [configDependencies](https://pnpm.io/settings#configdependencies) |
| `executionEnv` | unknownRecord | `mapChildWins` | absent | [executionEnv](https://pnpm.io/settings#executionenv) |
| `injectWorkspacePackages` | boolean | `scalar` | absent | [injectWorkspacePackages](https://pnpm.io/settings#injectworkspacepackages) |
| `syncInjectedDepsAfterScripts` | stringArray | `arrayUnion` | absent | [syncInjectedDepsAfterScripts](https://pnpm.io/settings#syncinjecteddepsafterscripts) |
| `dedupeInjectedDeps` | boolean | `scalar` | absent | [dedupeInjectedDeps](https://pnpm.io/settings#dedupeinjecteddeps) |

`patchedDependencies` additionally supports authoring-layer patch discovery and path rewrite (the `feat/patch-support` work) — a `{ strategy: "rewrite" }` input discovers `public/patches/` and rewrites each entry to a distributed `node_modules/.pnpm-config/<name>/<rel>` path baked into `base`. This is layered on top of the field by `package/src/patches/`; the descriptor row above is unchanged (`stringRecord`/`mapChildWins`/`warn`). `patchesDir` stays `absent`/unmanaged and is never read by the patch code. See [export-cli.md](export-cli.md) and [the patch distribution spec](specs/2026-06-30-patch-distribution-design.md).

### Runtime config (`runtime-cfg.ts`) — 8 fields

| key | kind | strategy | enforcement | anchor |
| --- | --- | --- | --- | --- |
| `packageManagerStrict` | boolean | `scalar` | absent | [packageManagerStrict](https://pnpm.io/settings#packagemanagerstrict) |
| `packageManagerStrictVersion` | boolean | `scalar` | absent | [packageManagerStrictVersion](https://pnpm.io/settings#packagemanagerstrictversion) |
| `managePackageManagerVersions` | boolean | `scalar` | absent | [managePackageManagerVersions](https://pnpm.io/settings#managepackagemanagerversions) |
| `pmOnFail` | enum | `scalar` | absent | [pmOnFail](https://pnpm.io/settings#pmonfail) |
| `runtimeOnFail` | enum | `scalar` | absent | [runtimeOnFail](https://pnpm.io/settings#runtimeonfail) |
| `nodeVersion` | string | `scalar` | absent | [nodeVersion](https://pnpm.io/settings#nodeversion) |
| `useNodeVersion` | string | `scalar` | absent | [useNodeVersion](https://pnpm.io/settings#usenodeversion) |
| `nodeDownloadMirrors` | unknownRecord | `mapChildWins` | absent | [nodeDownloadMirrors](https://pnpm.io/settings#nodedownloadmirrors) |

### Workspace (`workspace.ts`) — 10 fields

| key | kind | strategy | enforcement | anchor |
| --- | --- | --- | --- | --- |
| `catalogMode` | enum | `scalar` | absent | [catalogMode](https://pnpm.io/settings#catalogmode) |
| `cleanupUnusedCatalogs` | boolean | `scalar` | absent | [cleanupUnusedCatalogs](https://pnpm.io/settings#cleanupunusedcatalogs) |
| `linkWorkspacePackages` | union | `scalar` | absent | [linkWorkspacePackages](https://pnpm.io/settings#linkworkspacepackages) |
| `preferWorkspacePackages` | boolean | `scalar` | absent | [preferWorkspacePackages](https://pnpm.io/settings#preferworkspacepackages) |
| `saveWorkspaceProtocol` | union | `scalar` | absent | [saveWorkspaceProtocol](https://pnpm.io/settings#saveworkspaceprotocol) |
| `includeWorkspaceRoot` | boolean | `scalar` | absent | [includeWorkspaceRoot](https://pnpm.io/settings#includeworkspaceroot) |
| `ignoreWorkspaceCycles` | boolean | `scalar` | absent | [ignoreWorkspaceCycles](https://pnpm.io/settings#ignoreworkspacecycles) |
| `disallowWorkspaceCycles` | boolean | `scalar` | absent | [disallowWorkspaceCycles](https://pnpm.io/settings#disallowworkspacecycles) |
| `workspaceConcurrency` | number | `scalar` | absent | [workspaceConcurrency](https://pnpm.io/settings#workspaceconcurrency) |
| `auditLevel` | enum | `scalar` | absent | [auditLevel](https://pnpm.io/settings#auditlevel) |

### Misc preferences (`misc.ts`) — 14 fields

| key | kind | strategy | enforcement | anchor |
| --- | --- | --- | --- | --- |
| `resolutionMode` | enum | `scalar` | absent | [resolutionMode](https://pnpm.io/settings#resolutionmode) |
| `savePrefix` | enum | `scalar` | absent | [savePrefix](https://pnpm.io/settings#saveprefix) |
| `saveExact` | boolean | `scalar` | absent | [saveExact](https://pnpm.io/settings#saveexact) |
| `tag` | string | `scalar` | absent | [tag](https://pnpm.io/settings#tag) |
| `preferOffline` | boolean | `scalar` | absent | [preferOffline](https://pnpm.io/settings#preferoffline) |
| `dedupeDirectDeps` | boolean | `scalar` | absent | [dedupeDirectDeps](https://pnpm.io/settings#dedupedirectdeps) |
| `deployAllFiles` | boolean | `scalar` | absent | [deployAllFiles](https://pnpm.io/settings#deployallfiles) |
| `forceLegacyDeploy` | boolean | `scalar` | absent | [forceLegacyDeploy](https://pnpm.io/settings#forcelegacydeploy) |
| `extendNodePath` | boolean | `scalar` | absent | [extendNodePath](https://pnpm.io/settings#extendnodepath) |
| `preferSymlinkedExecutables` | boolean | `scalar` | absent | [preferSymlinkedExecutables](https://pnpm.io/settings#prefersymlinkedexecutables) |
| `ignoreCompatibilityDb` | boolean | `scalar` | absent | [ignoreCompatibilityDb](https://pnpm.io/settings#ignorecompatibilitydb) |
| `optimisticRepeatInstall` | boolean | `scalar` | absent | [optimisticRepeatInstall](https://pnpm.io/settings#optimisticrepeatinstall) |
| `recursiveInstall` | boolean | `scalar` | absent | [recursiveInstall](https://pnpm.io/settings#recursiveinstall) |
| `engineStrict` | boolean | `scalar` | absent | [engineStrict](https://pnpm.io/settings#enginestrict) |

### Network and publish (`network.ts`) — 11 fields

| key | kind | strategy | enforcement | anchor |
| --- | --- | --- | --- | --- |
| `networkConcurrency` | number | `scalar` | absent | [networkConcurrency](https://pnpm.io/settings#networkconcurrency) |
| `fetchRetries` | number | `scalar` | absent | [fetchRetries](https://pnpm.io/settings#fetchretries) |
| `fetchRetryFactor` | number | `scalar` | absent | [fetchRetryFactor](https://pnpm.io/settings#fetchretryfactor) |
| `fetchRetryMintimeout` | number | `scalar` | absent | [fetchRetryMintimeout](https://pnpm.io/settings#fetchretrymintimeout) |
| `fetchRetryMaxtimeout` | number | `scalar` | absent | [fetchRetryMaxtimeout](https://pnpm.io/settings#fetchretrymaxtimeout) |
| `fetchTimeout` | number | `scalar` | absent | [fetchTimeout](https://pnpm.io/settings#fetchtimeout) |
| `gitShallowHosts` | stringArray | `arrayUnion` | absent | [gitShallowHosts](https://pnpm.io/settings#gitshallowhosts) |
| `provenance` | boolean | `scalar` | absent | [provenance](https://pnpm.io/settings#provenance) |
| `gitChecks` | boolean | `scalar` | absent | [gitChecks](https://pnpm.io/settings#gitchecks) |
| `embedReadme` | boolean | `scalar` | absent | [embedReadme](https://pnpm.io/settings#embedreadme) |
| `publishBranch` | string | `scalar` | absent | [publishBranch](https://pnpm.io/settings#publishbranch) |

## Not covered

Keys excluded from the descriptor table, with the classification reason.

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
