# pnpm settings coverage

This page lists every `pnpm-workspace.yaml` setting this plugin manages and the settings it deliberately does not manage. The plugin covers a curated set of settings that make sense to centralize across repos; everything else is left to each consumer. Every supported setting can be overridden per-consumer by passing a `{ value, enforcement }` pair in `definePlugin` — see [concepts](./03-concepts.md) for the full enforcement model. The complete pnpm settings reference is at [pnpm.io/settings](https://pnpm.io/settings).

## Supported settings

The plugin manages 121 settings in total. The **Enforcement** column shows the default behavior when a consuming repo diverges from the managed value:

- `absent` — divergence is allowed silently; the local config wins.
- `warn` — divergence is allowed but prints a warning box describing the conflict.

Security-relevant settings default to `warn` so divergences are visible without blocking the install.

### Dependency resolution & trust

| Setting | Enforcement | pnpm docs |
| --- | --- | --- |
| `catalogs` | warn | [catalogs](https://pnpm.io/settings#catalogs) |
| `catalog` | warn | [catalog](https://pnpm.io/settings#catalog) |
| `overrides` | warn | [overrides](https://pnpm.io/settings#overrides) |
| `peerDependencyRules` | warn | [peerDependencyRules](https://pnpm.io/settings#peerdependencyrules) |
| `allowBuilds` | warn | [allowBuilds](https://pnpm.io/settings#allowbuilds) |
| `strictDepBuilds` | warn | [strictDepBuilds](https://pnpm.io/settings#strictdepbuilds) |
| `blockExoticSubdeps` | warn | [blockExoticSubdeps](https://pnpm.io/settings#blockexoticsubdeps) |
| `minimumReleaseAge` | warn | [minimumReleaseAge](https://pnpm.io/settings#minimumreleaseage) |
| `minimumReleaseAgeStrict` | warn | [minimumReleaseAgeStrict](https://pnpm.io/settings#minimumreleaseagestrict) |
| `minimumReleaseAgeIgnoreMissingTime` | warn | [minimumReleaseAgeIgnoreMissingTime](https://pnpm.io/settings#minimumreleaseageignoremissingtime) |
| `trustPolicy` | warn | [trustPolicy](https://pnpm.io/settings#trustpolicy) |
| `trustPolicyExclude` | warn | [trustPolicyExclude](https://pnpm.io/settings#trustpolicyexclude) |
| `trustPolicyIgnoreAfter` | warn | [trustPolicyIgnoreAfter](https://pnpm.io/settings#trustpolicyignoreafter) |
| `trustLockfile` | warn | [trustLockfile](https://pnpm.io/settings#trustlockfile) |
| `packageExtensions` | absent | [packageExtensions](https://pnpm.io/settings#packageextensions) |
| `allowedDeprecatedVersions` | absent | [allowedDeprecatedVersions](https://pnpm.io/settings#alloweddeprecatedversions) |
| `publicHoistPattern` | absent | [publicHoistPattern](https://pnpm.io/settings#publichoistpattern) |
| `minimumReleaseAgeExclude` | absent | [minimumReleaseAgeExclude](https://pnpm.io/settings#minimumreleaseageexclude) |
| `supportedArchitectures` | absent | [supportedArchitectures](https://pnpm.io/settings#supportedarchitectures) |
| `auditConfig` | absent | [auditConfig](https://pnpm.io/settings#auditconfig) |
| `ignoredOptionalDependencies` | absent | [ignoredOptionalDependencies](https://pnpm.io/settings#ignoredoptionaldependencies) |
| `updateConfig` | absent | [updateConfig](https://pnpm.io/settings#updateconfig) |
| `confirmModulesPurge` | absent | undocumented upstream — no pnpm.io anchor |

### Hoisting & node-modules

| Setting | Enforcement | pnpm docs |
| --- | --- | --- |
| `verifyStoreIntegrity` | warn | [verifyStoreIntegrity](https://pnpm.io/settings#verifystoreintegrity) |
| `strictStorePkgContentCheck` | warn | [strictStorePkgContentCheck](https://pnpm.io/settings#strictstorepkgcontentcheck) |
| `hoist` | absent | [hoist](https://pnpm.io/settings#hoist) |
| `hoistWorkspacePackages` | absent | [hoistWorkspacePackages](https://pnpm.io/settings#hoistworkspacepackages) |
| `hoistPattern` | absent | [hoistPattern](https://pnpm.io/settings#hoistpattern) |
| `shamefullyHoist` | absent | [shamefullyHoist](https://pnpm.io/settings#shamefullyhoist) |
| `hoistingLimits` | absent | [hoistingLimits](https://pnpm.io/settings#hoistinglimits) |
| `modulesDir` | absent | [modulesDir](https://pnpm.io/settings#modulesdir) |
| `nodeLinker` | absent | [nodeLinker](https://pnpm.io/settings#nodelinker) |
| `symlink` | absent | [symlink](https://pnpm.io/settings#symlink) |
| `enableModulesDir` | absent | [enableModulesDir](https://pnpm.io/settings#enablemodulesdir) |
| `virtualStoreDir` | absent | [virtualStoreDir](https://pnpm.io/settings#virtualstoredir) |
| `virtualStoreDirMaxLength` | absent | [virtualStoreDirMaxLength](https://pnpm.io/settings#virtualstoredirmaxlength) |
| `virtualStoreOnly` | absent | [virtualStoreOnly](https://pnpm.io/settings#virtualstoreonly) |
| `packageImportMethod` | absent | [packageImportMethod](https://pnpm.io/settings#packageimportmethod) |
| `modulesCacheMaxAge` | absent | [modulesCacheMaxAge](https://pnpm.io/settings#modulescachemaxage) |
| `dlxCacheMaxAge` | absent | [dlxCacheMaxAge](https://pnpm.io/settings#dlxcachemaxage) |

### Lockfile & peers

| Setting | Enforcement | pnpm docs |
| --- | --- | --- |
| `lockfile` | absent | [lockfile](https://pnpm.io/settings#lockfile) |
| `preferFrozenLockfile` | absent | [preferFrozenLockfile](https://pnpm.io/settings#preferfrozenlockfile) |
| `lockfileIncludeTarballUrl` | absent | [lockfileIncludeTarballUrl](https://pnpm.io/settings#lockfileincludetarballurl) |
| `gitBranchLockfile` | absent | [gitBranchLockfile](https://pnpm.io/settings#gitbranchlockfile) |
| `mergeGitBranchLockfilesBranchPattern` | absent | [mergeGitBranchLockfilesBranchPattern](https://pnpm.io/settings#mergegitbranchlockfilesbranchpattern) |
| `peersSuffixMaxLength` | absent | [peersSuffixMaxLength](https://pnpm.io/settings#peerssuffixmaxlength) |
| `sharedWorkspaceLockfile` | absent | [sharedWorkspaceLockfile](https://pnpm.io/settings#sharedworkspacelockfile) |
| `autoInstallPeers` | absent | [autoInstallPeers](https://pnpm.io/settings#autoinstallpeers) |
| `dedupePeerDependents` | absent | [dedupePeerDependents](https://pnpm.io/settings#dedupepeerdependents) |
| `dedupePeers` | absent | [dedupePeers](https://pnpm.io/settings#dedupepeers) |
| `strictPeerDependencies` | absent | [strictPeerDependencies](https://pnpm.io/settings#strictpeerdependencies) |
| `resolvePeersFromWorkspaceRoot` | absent | [resolvePeersFromWorkspaceRoot](https://pnpm.io/settings#resolvepeersfromworkspaceroot) |

### Build, scripts & patches

| Setting | Enforcement | pnpm docs |
| --- | --- | --- |
| `onlyBuiltDependencies` | warn | [onlyBuiltDependencies](https://pnpm.io/settings#onlybuiltdependencies) |
| `onlyBuiltDependenciesFile` | warn | [onlyBuiltDependenciesFile](https://pnpm.io/settings#onlybuiltdependenciesfile) |
| `dangerouslyAllowAllBuilds` | warn | [dangerouslyAllowAllBuilds](https://pnpm.io/settings#dangerouslyallowallbuilds) |
| `patchedDependencies` | warn | [patchedDependencies](https://pnpm.io/settings#patcheddependencies) |
| `neverBuiltDependencies` | absent | [neverBuiltDependencies](https://pnpm.io/settings#neverbuiltdependencies) |
| `ignoredBuiltDependencies` | absent | [ignoredBuiltDependencies](https://pnpm.io/settings#ignoredbuiltdependencies) |
| `ignoreScripts` | absent | [ignoreScripts](https://pnpm.io/settings#ignorescripts) |
| `ignoreDepScripts` | absent | [ignoreDepScripts](https://pnpm.io/settings#ignoredepscripts) |
| `childConcurrency` | absent | [childConcurrency](https://pnpm.io/settings#childconcurrency) |
| `sideEffectsCache` | absent | [sideEffectsCache](https://pnpm.io/settings#sideeffectscache) |
| `sideEffectsCacheReadonly` | absent | [sideEffectsCacheReadonly](https://pnpm.io/settings#sideeffectscachereadonly) |
| `nodeOptions` | absent | [nodeOptions](https://pnpm.io/settings#nodeoptions) |
| `verifyDepsBeforeRun` | absent | [verifyDepsBeforeRun](https://pnpm.io/settings#verifydepsbeforerun) |
| `enablePrePostScripts` | absent | [enablePrePostScripts](https://pnpm.io/settings#enableprepostscripts) |
| `scriptShell` | absent | [scriptShell](https://pnpm.io/settings#scriptshell) |
| `shellEmulator` | absent | [shellEmulator](https://pnpm.io/settings#shellemulator) |
| `requiredScripts` | absent | [requiredScripts](https://pnpm.io/settings#requiredscripts) |
| `allowUnusedPatches` | absent | [allowUnusedPatches](https://pnpm.io/settings#allowunusedpatches) |
| `allowNonAppliedPatches` | absent | [allowNonAppliedPatches](https://pnpm.io/settings#allownonappliedpatches) |
| `ignorePatchFailures` | absent | [ignorePatchFailures](https://pnpm.io/settings#ignorepatchfailures) |
| `patchesDir` | absent | [patchesDir](https://pnpm.io/settings#patchesdir) |
| `configDependencies` | absent | [configDependencies](https://pnpm.io/settings#configdependencies) |
| `executionEnv` | absent | [executionEnv](https://pnpm.io/settings#executionenv) |
| `injectWorkspacePackages` | absent | [injectWorkspacePackages](https://pnpm.io/settings#injectworkspacepackages) |
| `syncInjectedDepsAfterScripts` | absent | [syncInjectedDepsAfterScripts](https://pnpm.io/settings#syncinjecteddepsafterscripts) |
| `dedupeInjectedDeps` | absent | [dedupeInjectedDeps](https://pnpm.io/settings#dedupeinjecteddeps) |

### Package-manager & Node version

| Setting | Enforcement | pnpm docs |
| --- | --- | --- |
| `packageManagerStrict` | absent | [packageManagerStrict](https://pnpm.io/settings#packagemanagerstrict) |
| `packageManagerStrictVersion` | absent | [packageManagerStrictVersion](https://pnpm.io/settings#packagemanagerstrictversion) |
| `managePackageManagerVersions` | absent | [managePackageManagerVersions](https://pnpm.io/settings#managepackagemanagerversions) |
| `pmOnFail` | absent | [pmOnFail](https://pnpm.io/settings#pmonfail) |
| `runtimeOnFail` | absent | [runtimeOnFail](https://pnpm.io/settings#runtimeonfail) |
| `nodeVersion` | absent | [nodeVersion](https://pnpm.io/settings#nodeversion) |
| `useNodeVersion` | absent | [useNodeVersion](https://pnpm.io/settings#usenodeversion) |
| `nodeDownloadMirrors` | absent | [nodeDownloadMirrors](https://pnpm.io/settings#nodedownloadmirrors) |

### Catalog, workspace & audit

| Setting | Enforcement | pnpm docs |
| --- | --- | --- |
| `catalogMode` | absent | [catalogMode](https://pnpm.io/settings#catalogmode) |
| `cleanupUnusedCatalogs` | absent | [cleanupUnusedCatalogs](https://pnpm.io/settings#cleanupunusedcatalogs) |
| `linkWorkspacePackages` | absent | [linkWorkspacePackages](https://pnpm.io/settings#linkworkspacepackages) |
| `preferWorkspacePackages` | absent | [preferWorkspacePackages](https://pnpm.io/settings#preferworkspacepackages) |
| `saveWorkspaceProtocol` | absent | [saveWorkspaceProtocol](https://pnpm.io/settings#saveworkspaceprotocol) |
| `includeWorkspaceRoot` | absent | [includeWorkspaceRoot](https://pnpm.io/settings#includeworkspaceroot) |
| `ignoreWorkspaceCycles` | absent | [ignoreWorkspaceCycles](https://pnpm.io/settings#ignoreworkspacecycles) |
| `disallowWorkspaceCycles` | absent | [disallowWorkspaceCycles](https://pnpm.io/settings#disallowworkspacecycles) |
| `workspaceConcurrency` | absent | [workspaceConcurrency](https://pnpm.io/settings#workspaceconcurrency) |
| `auditLevel` | absent | [auditLevel](https://pnpm.io/settings#auditlevel) |

### Preferences

| Setting | Enforcement | pnpm docs |
| --- | --- | --- |
| `resolutionMode` | absent | [resolutionMode](https://pnpm.io/settings#resolutionmode) |
| `savePrefix` | absent | [savePrefix](https://pnpm.io/settings#saveprefix) |
| `saveExact` | absent | [saveExact](https://pnpm.io/settings#saveexact) |
| `tag` | absent | [tag](https://pnpm.io/settings#tag) |
| `preferOffline` | absent | [preferOffline](https://pnpm.io/settings#preferoffline) |
| `dedupeDirectDeps` | absent | [dedupeDirectDeps](https://pnpm.io/settings#dedupedirectdeps) |
| `deployAllFiles` | absent | [deployAllFiles](https://pnpm.io/settings#deployallfiles) |
| `forceLegacyDeploy` | absent | [forceLegacyDeploy](https://pnpm.io/settings#forcelegacydeploy) |
| `extendNodePath` | absent | [extendNodePath](https://pnpm.io/settings#extendnodepath) |
| `preferSymlinkedExecutables` | absent | [preferSymlinkedExecutables](https://pnpm.io/settings#prefersymlinkedexecutables) |
| `ignoreCompatibilityDb` | absent | [ignoreCompatibilityDb](https://pnpm.io/settings#ignorecompatibilitydb) |
| `optimisticRepeatInstall` | absent | [optimisticRepeatInstall](https://pnpm.io/settings#optimisticrepeatinstall) |
| `recursiveInstall` | absent | [recursiveInstall](https://pnpm.io/settings#recursiveinstall) |
| `engineStrict` | absent | [engineStrict](https://pnpm.io/settings#enginestrict) |

### Network & publish

| Setting | Enforcement | pnpm docs |
| --- | --- | --- |
| `networkConcurrency` | absent | [networkConcurrency](https://pnpm.io/settings#networkconcurrency) |
| `fetchRetries` | absent | [fetchRetries](https://pnpm.io/settings#fetchretries) |
| `fetchRetryFactor` | absent | [fetchRetryFactor](https://pnpm.io/settings#fetchretryfactor) |
| `fetchRetryMintimeout` | absent | [fetchRetryMintimeout](https://pnpm.io/settings#fetchretrymintimeout) |
| `fetchRetryMaxtimeout` | absent | [fetchRetryMaxtimeout](https://pnpm.io/settings#fetchretrymaxtimeout) |
| `fetchTimeout` | absent | [fetchTimeout](https://pnpm.io/settings#fetchtimeout) |
| `gitShallowHosts` | absent | [gitShallowHosts](https://pnpm.io/settings#gitshallowhosts) |
| `provenance` | absent | [provenance](https://pnpm.io/settings#provenance) |
| `gitChecks` | absent | [gitChecks](https://pnpm.io/settings#gitchecks) |
| `embedReadme` | absent | [embedReadme](https://pnpm.io/settings#embedreadme) |
| `publishBranch` | absent | [publishBranch](https://pnpm.io/settings#publishbranch) |

## Unsupported settings

The following `pnpm-workspace.yaml` settings are not managed by this plugin.

| Setting(s) | Reason |
| --- | --- |
| `packages` | workspace package globs — not a tunable setting, managed separately |
| `registry`, `registries`, `registrySupportsTimeField` | registry config is machine- or org-specific |
| `ca`, `cafile`, `cert`, `key` | TLS material — machine-specific secrets |
| `proxy`, `httpsProxy`, `noproxy`, `localAddress`, `maxsockets`, `strictSsl` | proxy and network transport — machine-specific |
| `color`, `loglevel`, `reporter`, `useStderr`, `updateNotifier`, `useBetaCli` | CLI output and reporter — user-environment preferences |
| `npmPath`, `npmrcAuthFile` | external tool path or auth file — machine-specific |
| `storeDir`, `cacheDir`, `stateDir`, `globalDir`, `globalBinDir` | filesystem locations — machine-specific paths |
| `pnpmfile`, `globalPnpmfile`, `ignorePnpmfile` | pnpmfile meta — self-referential to this plugin |
| `unsafePerm` | UID/GID switching — machine- and privilege-specific |
| `ignoreWorkspaceRootCheck`, `failIfNoMatch` | CLI invocation behavior — not workspace-wide config |
| `enableGlobalVirtualStore`, `nodeExperimentalPackageMap`, `nodePackageMapType`, `useRunningStoreServer`, `frozenStore` | experimental or niche-daemon flags |

## Contributors

The authoritative field matrix (descriptor module, strategy, kind and anchor for every entry) lives at [`.claude/design/rolldown-pnpm-config/settings-coverage.md`](../.claude/design/rolldown-pnpm-config/settings-coverage.md). Update that file whenever the descriptor table in `package/src/descriptors/` changes.
