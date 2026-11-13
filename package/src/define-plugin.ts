import type { PnpmSettingType } from "@effected/pnpm/settings";
import type { CatalogDeclaration } from "./catalogs.js";
import type { AllowedVersionsFromCatalogs } from "./plugin/allowed-versions.js";
import type { OverridesFromCatalogs } from "./plugin/overrides-from-catalogs.js";
import type { Enforcement } from "./runtime/types.js";

/**
 * A field value, bare or wrapped with an explicit enforcement override.
 *
 * @public
 */
export type FieldInput<T> = T | { readonly value: T; readonly enforcement?: Enforcement };

/**
 * Per-field local merge directive applied only by `rolldown-pnpm-config export`.
 * All keys optional: `value` alone overwrites; `strategy` unions/differences
 * `value` with the managed value; `preserve` (overrides only) keeps existing
 * file entries whose value starts with a listed protocol.
 *
 * @public
 */
export interface LocalDirective<T> {
	readonly preserve?: readonly string[];
	readonly value?: T;
	readonly strategy?: "union" | "difference" | "merge" | "rewrite";
}

/**
 * The declarative plugin configuration.
 *
 * @public
 */
export interface PluginConfig {
	/**
	 * Identifier for this config dependency, surfaced in runtime warnings as a
	 * `[name]` tag. Conventionally the config package's npm name,
	 * e.g. `"@acme/pnpm-config"`. Required.
	 *
	 * @public
	 */
	readonly name: string;
	/** The catalogs to inject into pnpm config, keyed by catalog name. */
	readonly catalogs: Record<string, CatalogDeclaration>;
	/**
	 * Export-only overrides. Each field set here replaces the corresponding
	 * generated field when running `rolldown-pnpm-config export`. Ignored by the
	 * build and the shipped pnpmfile.
	 */
	readonly local?: {
		/**
		 * Override the local discovery root for distributed patches (default
		 * `public/patches/` adjacent to the build file). The local-only `patches/`
		 * folder detection is independent and unaffected.
		 */
		readonly localPatchesDir?: string;
	} & {
		readonly [K in Exclude<keyof PluginConfig, "overridesFromCatalogs">]?:
			| PluginConfig[K]
			| LocalDirective<PluginConfig[K]>;
	};
	/** Per-package manifest overrides merged into the dependency graph. */
	readonly packageExtensions?: FieldInput<PnpmSettingType<"packageExtensions">>;
	/** Deprecated versions explicitly allowed, keyed by package. */
	readonly allowedDeprecatedVersions?: FieldInput<PnpmSettingType<"allowedDeprecatedVersions">>;
	/**
	 * Glob patterns hoisted to the root `node_modules`.
	 *
	 * The optional `excludeByRepo` refine is a map **keyed by consuming-repo name**
	 * (the root `package.json` `name` of the repo where this config runs); each
	 * value is the list of hoist patterns to drop in that repo. Example — drop
	 * `@savvy-web/cli`/`@savvy-web/mcp` only in the `savvy-web-systems` repo:
	 *
	 * ```ts
	 * publicHoistPattern: {
	 *   value: ["@types/*", "@savvy-web/cli", "@savvy-web/mcp"],
	 *   excludeByRepo: { "savvy-web-systems": ["@savvy-web/cli", "@savvy-web/mcp"] },
	 * }
	 * ```
	 */
	readonly publicHoistPattern?:
		| string[]
		| {
				readonly value: string[];
				readonly enforcement?: Enforcement;
				readonly excludeByRepo?: Record<string, string[]>; // { [consumingRepoName]: patternsToDrop[] }
		  };
	/** Packages excluded from the minimum-release-age quarantine. */
	readonly minimumReleaseAgeExclude?: FieldInput<PnpmSettingType<"minimumReleaseAgeExclude">>;
	/** Architectures to install optional dependencies for, by axis (`os`, `cpu`, `libc`). */
	readonly supportedArchitectures?: FieldInput<PnpmSettingType<"supportedArchitectures">>;
	/** The GitHub advisory IDs `pnpm audit` ignores (`{ ignoreGhsas }`), the only key pnpm 12 reads. */
	readonly auditConfig?: FieldInput<PnpmSettingType<"auditConfig">>;
	/**
	 * The `pnpm audit` section: the minimum `level` to report, the advisories to
	 * `ignore`, and `ignorePrune`. Supersedes `auditLevel` and `auditConfig`. A
	 * consumer's `ignore` list is unioned with the managed one (deduped, sorted),
	 * so a local advisory never drops a managed one; `level` and `ignorePrune`
	 * are the consumer's when set.
	 */
	readonly audit?: FieldInput<PnpmSettingType<"audit">>;
	/** Security version overrides, keyed by package selector. */
	readonly overrides?: FieldInput<Record<string, string>>;
	/**
	 * Derive `overrides` from a catalog (or several), pinning every member of a
	 * release family to its exact catalog version across the whole consumer
	 * graph. Resolved and merged under `overrides` at build time, so the
	 * pnpmfile, `export` and `preview` all carry the result; an authored
	 * `overrides` entry wins on a selector clash. Not a pnpm field itself.
	 */
	readonly overridesFromCatalogs?: OverridesFromCatalogs | readonly OverridesFromCatalogs[];
	/** Peer dependency rules: allowed versions plus ignore/allow-any lists. */
	readonly peerDependencyRules?: FieldInput<{
		readonly allowedVersions?: Record<string, string>;
		readonly ignoreMissing?: string[];
		readonly allowAny?: string[];
		/**
		 * Derive version-qualified `allowedVersions` rules from a catalog (or several).
		 * Resolved and merged into `allowedVersions` at build time, then stripped; a
		 * manually authored `allowedVersions` entry wins on a key clash.
		 */
		readonly allowedVersionsFromCatalogs?: AllowedVersionsFromCatalogs | readonly AllowedVersionsFromCatalogs[];
	}>;
	/** Whether dependency build scripts are blocked unless explicitly allowed. */
	readonly strictDepBuilds?: FieldInput<PnpmSettingType<"strictDepBuilds">>;
	/** Whether exotic (non-registry) subdependencies are blocked. */
	readonly blockExoticSubdeps?: FieldInput<PnpmSettingType<"blockExoticSubdeps">>;
	/** Minimum age (minutes) a release must reach before it is installable. */
	readonly minimumReleaseAge?: FieldInput<PnpmSettingType<"minimumReleaseAge">>;
	/** Packages whose build scripts are explicitly allowed to run. */
	readonly allowBuilds?: FieldInput<PnpmSettingType<"allowBuilds">>;
	/** Optional dependencies excluded from installation entirely. */
	readonly ignoredOptionalDependencies?: FieldInput<PnpmSettingType<"ignoredOptionalDependencies">>;
	/** Per-dependency update behavior: which packages to ignore during updates. */
	readonly updateConfig?: FieldInput<PnpmSettingType<"updateConfig">>;
	/**
	 * The `pnpm update` section: the dependency patterns it skips (`ignoreDeps`),
	 * whether it writes a change intent, and whether it updates GitHub Actions.
	 * Supersedes `updateConfig`. A consumer's `ignoreDeps` list is unioned with
	 * the managed one; the other keys are the consumer's when set.
	 */
	readonly update?: FieldInput<PnpmSettingType<"update">>;
	/** Default version catalog entries merged as a single `default` catalog. */
	readonly catalog?: FieldInput<PnpmSettingType<"catalog">>;
	/** Whether any resolution fails when a package violates minimum-release-age. */
	readonly minimumReleaseAgeStrict?: FieldInput<PnpmSettingType<"minimumReleaseAgeStrict">>;
	/** Whether to skip the release-age check when publish-time metadata is absent. */
	readonly minimumReleaseAgeIgnoreMissingTime?: FieldInput<PnpmSettingType<"minimumReleaseAgeIgnoreMissingTime">>;
	/** Defines what package integrity verification is enforced on installs. */
	readonly trustPolicy?: FieldInput<PnpmSettingType<"trustPolicy">>;
	/** Packages excluded from trust-policy enforcement. */
	readonly trustPolicyExclude?: FieldInput<PnpmSettingType<"trustPolicyExclude">>;
	/** Minutes after installation after which the trust check is skipped. */
	readonly trustPolicyIgnoreAfter?: FieldInput<PnpmSettingType<"trustPolicyIgnoreAfter">>;
	/** Whether the lockfile alone is trusted without re-verifying each package's integrity. */
	readonly trustLockfile?: FieldInput<PnpmSettingType<"trustLockfile">>;
	/** Whether packages are hoisted to the virtual store root node_modules. */
	readonly hoist?: FieldInput<PnpmSettingType<"hoist">>;
	/** Whether workspace packages are hoisted to the root node_modules. */
	readonly hoistWorkspacePackages?: FieldInput<PnpmSettingType<"hoistWorkspacePackages">>;
	/** Glob patterns describing which packages are hoisted to the virtual store root. */
	readonly hoistPattern?: FieldInput<PnpmSettingType<"hoistPattern">>;
	/** Whether all packages are hoisted to the root node_modules (shameful flat layout). */
	readonly shamefullyHoist?: FieldInput<PnpmSettingType<"shamefullyHoist">>;
	/** Defines the scope to which dependencies are hoisted. */
	readonly hoistingLimits?: FieldInput<PnpmSettingType<"hoistingLimits">>;
	/** The directory in which node_modules will be created. */
	readonly modulesDir?: FieldInput<PnpmSettingType<"modulesDir">>;
	/** Which linker installs packages: `isolated`, `hoisted`, `pnp`, `loaded`, or `{ type: "loaded", excluded }`. */
	readonly nodeLinker?: FieldInput<PnpmSettingType<"nodeLinker">>;
	/** Whether symlinks are created when linking packages from the store. */
	readonly symlink?: FieldInput<PnpmSettingType<"symlink">>;
	/** Whether the local node_modules directory should be created during install. */
	readonly enableModulesDir?: FieldInput<PnpmSettingType<"enableModulesDir">>;
	/** The directory with links to the store (default: node_modules/.pnpm). */
	readonly virtualStoreDir?: FieldInput<PnpmSettingType<"virtualStoreDir">>;
	/** Maximum allowed length of directory names inside the virtual store. */
	readonly virtualStoreDirMaxLength?: FieldInput<PnpmSettingType<"virtualStoreDirMaxLength">>;
	/** Whether packages are written only to the virtual store without a local modules dir. */
	readonly virtualStoreOnly?: FieldInput<PnpmSettingType<"virtualStoreOnly">>;
	/** Controls how packages are imported from the content-addressable store. */
	readonly packageImportMethod?: FieldInput<PnpmSettingType<"packageImportMethod">>;
	/** Maximum age (minutes) of unused modules directories before they are pruned. */
	readonly modulesCacheMaxAge?: FieldInput<PnpmSettingType<"modulesCacheMaxAge">>;
	/** Maximum age (minutes) of cached dlx command results before re-fetch. */
	readonly dlxCacheMaxAge?: FieldInput<PnpmSettingType<"dlxCacheMaxAge">>;
	/** Whether integrity checksums in the store are verified before using a package. */
	readonly verifyStoreIntegrity?: FieldInput<PnpmSettingType<"verifyStoreIntegrity">>;
	/** Whether store package content checksums are verified strictly on each access. */
	readonly strictStorePkgContentCheck?: FieldInput<PnpmSettingType<"strictStorePkgContentCheck">>;
	/** `false` to neither read nor write `pnpm-lock.yaml`; the object form keeps it and sets `format`, `integrityTarget` and `includeResolutionSettings`. */
	readonly lockfile?: FieldInput<PnpmSettingType<"lockfile">>;
	/** If true, pnpm does not generate a lockfile and fails if the lockfile is out of date. */
	readonly preferFrozenLockfile?: FieldInput<PnpmSettingType<"preferFrozenLockfile">>;
	/** Whether the lockfile includes the full tarball URL for each resolved dependency. */
	readonly lockfileIncludeTarballUrl?: FieldInput<PnpmSettingType<"lockfileIncludeTarballUrl">>;
	/** When enabled, the generated lockfile name is based on the current branch name. */
	readonly gitBranchLockfile?: FieldInput<PnpmSettingType<"gitBranchLockfile">>;
	/** Branch name patterns whose lockfiles are merged into the main lockfile on install. */
	readonly mergeGitBranchLockfilesBranchPattern?: FieldInput<PnpmSettingType<"mergeGitBranchLockfilesBranchPattern">>;
	/** Maximum length of the peers suffix appended to dependency directory names in the virtual store. */
	readonly peersSuffixMaxLength?: FieldInput<PnpmSettingType<"peersSuffixMaxLength">>;
	/** Whether a single shared lockfile is used for all projects in the workspace. */
	readonly sharedWorkspaceLockfile?: FieldInput<PnpmSettingType<"sharedWorkspaceLockfile">>;
	/** Whether missing peer dependencies are installed automatically. */
	readonly autoInstallPeers?: FieldInput<PnpmSettingType<"autoInstallPeers">>;
	/** Whether packages with peer dependencies are deduplicated after peers are resolved. */
	readonly dedupePeerDependents?: FieldInput<PnpmSettingType<"dedupePeerDependents">>;
	/** Whether peer dependencies are deduplicated during resolution. */
	readonly dedupePeers?: FieldInput<PnpmSettingType<"dedupePeers">>;
	/** If true, commands fail when there are missing or invalid peer dependencies. */
	readonly strictPeerDependencies?: FieldInput<PnpmSettingType<"strictPeerDependencies">>;
	/** Whether peer dependencies are resolved using packages installed in the workspace root. */
	readonly resolvePeersFromWorkspaceRoot?: FieldInput<PnpmSettingType<"resolvePeersFromWorkspaceRoot">>;
	/** When true, all build scripts are allowed to run without restriction. */
	readonly dangerouslyAllowAllBuilds?: FieldInput<PnpmSettingType<"dangerouslyAllowAllBuilds">>;
	/** Whether lifecycle scripts of packages in node_modules are not executed. */
	readonly ignoreScripts?: FieldInput<PnpmSettingType<"ignoreScripts">>;
	/** Maximum number of child processes that build scripts can spawn concurrently. */
	readonly childConcurrency?: FieldInput<PnpmSettingType<"childConcurrency">>;
	/** Whether install-script results are cached: a boolean, or `{ read, write, remote, exclude }`. */
	readonly sideEffectsCache?: FieldInput<PnpmSettingType<"sideEffectsCache">>;
	/** Whether the side effects cache is used but never updated. */
	readonly sideEffectsCacheReadonly?: FieldInput<PnpmSettingType<"sideEffectsCacheReadonly">>;
	/** Options passed to Node.js via NODE_OPTIONS when running scripts. */
	readonly nodeOptions?: FieldInput<PnpmSettingType<"nodeOptions">>;
	/** Whether pnpm verifies that the install is up to date before running scripts. */
	readonly verifyDepsBeforeRun?: FieldInput<PnpmSettingType<"verifyDepsBeforeRun">>;
	/** Whether pre/post lifecycle scripts are run automatically alongside the main script. */
	readonly enablePrePostScripts?: FieldInput<PnpmSettingType<"enablePrePostScripts">>;
	/** The shell used to execute scripts. */
	readonly scriptShell?: FieldInput<PnpmSettingType<"scriptShell">>;
	/** Whether a POSIX shell emulator is used when running scripts on Windows. */
	readonly shellEmulator?: FieldInput<PnpmSettingType<"shellEmulator">>;
	/** Scripts that must exist in every project matching the current filter. */
	readonly requiredScripts?: FieldInput<PnpmSettingType<"requiredScripts">>;
	/**
	 * Patches applied to dependencies, keyed by package identifier. Pass a plain
	 * map for explicit control, or `{ strategy: "rewrite" }` (the default when
	 * `public/patches/` contains files) to auto-discover and rewrite patch paths
	 * to their distributed `node_modules/.pnpm-config/<name>/` location.
	 */
	readonly patchedDependencies?: FieldInput<Record<string, string>> | { readonly strategy: "rewrite" };
	/** Whether unused patches (patches that apply to no installed package) are allowed. */
	readonly allowUnusedPatches?: FieldInput<PnpmSettingType<"allowUnusedPatches">>;
	/** Directory where patch files are stored (default: patches). */
	readonly patchesDir?: FieldInput<PnpmSettingType<"patchesDir">>;
	/** Packages installed before other packages so their config scripts can run first. */
	readonly configDependencies?: FieldInput<PnpmSettingType<"configDependencies">>;
	/** Whether local workspace packages are injected instead of symlinked. */
	readonly injectWorkspacePackages?: FieldInput<PnpmSettingType<"injectWorkspacePackages">>;
	/** Scripts after which injected dependencies are re-synced. */
	readonly syncInjectedDepsAfterScripts?: FieldInput<PnpmSettingType<"syncInjectedDepsAfterScripts">>;
	/** Whether injected workspace packages are deduplicated. */
	readonly dedupeInjectedDeps?: FieldInput<PnpmSettingType<"dedupeInjectedDeps">>;
	/** Action taken when the package manager version does not match the packageManager field. */
	readonly pmOnFail?: FieldInput<PnpmSettingType<"pmOnFail">>;
	/** Action taken when the Node.js version does not match the engines.node field. */
	readonly runtimeOnFail?: FieldInput<PnpmSettingType<"runtimeOnFail">>;
	/** The Node.js version to use when checking packages' engines field. */
	readonly nodeVersion?: FieldInput<PnpmSettingType<"nodeVersion">>;
	/** Mirror URLs for downloading Node.js, keyed by distribution name. */
	readonly nodeDownloadMirrors?: FieldInput<PnpmSettingType<"nodeDownloadMirrors">>;
	/** Controls how dependencies are resolved against entries defined in the catalogs field. */
	readonly catalogMode?: FieldInput<PnpmSettingType<"catalogMode">>;
	/** Whether pnpm removes catalog entries that are not used by any project in the workspace. */
	readonly cleanupUnusedCatalogs?: FieldInput<PnpmSettingType<"cleanupUnusedCatalogs">>;
	/** Whether workspace packages are linked from the workspace, not downloaded from the registry. */
	readonly linkWorkspacePackages?: FieldInput<PnpmSettingType<"linkWorkspacePackages">>;
	/** Whether versions of packages from the workspace are preferred over versions from the registry. */
	readonly preferWorkspacePackages?: FieldInput<PnpmSettingType<"preferWorkspacePackages">>;
	/** Controls whether the workspace: range protocol is used when saving workspace package versions. */
	readonly saveWorkspaceProtocol?: FieldInput<PnpmSettingType<"saveWorkspaceProtocol">>;
	/** Whether tasks of the root workspace project are included when executing commands recursively. */
	readonly includeWorkspaceRoot?: FieldInput<PnpmSettingType<"includeWorkspaceRoot">>;
	/** Whether workspace dependency cycles are silently ignored. */
	readonly ignoreWorkspaceCycles?: FieldInput<PnpmSettingType<"ignoreWorkspaceCycles">>;
	/** Whether an error is thrown when a workspace dependency cycle is detected. */
	readonly disallowWorkspaceCycles?: FieldInput<PnpmSettingType<"disallowWorkspaceCycles">>;
	/** Number of projects built in parallel when running commands recursively. */
	readonly workspaceConcurrency?: FieldInput<PnpmSettingType<"workspaceConcurrency">>;
	/** Minimum severity level for audit reports (low, moderate, high, critical). */
	readonly auditLevel?: FieldInput<PnpmSettingType<"auditLevel">>;
	/** Algorithm used to resolve dependencies from the registry. */
	readonly resolutionMode?: FieldInput<PnpmSettingType<"resolutionMode">>;
	/** Version prefix prepended to package versions saved in package.json. */
	readonly savePrefix?: FieldInput<PnpmSettingType<"savePrefix">>;
	/** Whether packages are saved with an exact version instead of a semver range. */
	readonly saveExact?: FieldInput<PnpmSettingType<"saveExact">>;
	/** The default tag used when adding packages without a specified version. */
	readonly tag?: FieldInput<PnpmSettingType<"tag">>;
	/** Whether cached data is used without network requests, failing only if data is missing. */
	readonly preferOffline?: FieldInput<PnpmSettingType<"preferOffline">>;
	/** Whether direct dependencies are deduplicated when they can be satisfied by an existing dependency. */
	readonly dedupeDirectDeps?: FieldInput<PnpmSettingType<"dedupeDirectDeps">>;
	/** Whether all files of a deployed package are copied including those in node_modules. */
	readonly deployAllFiles?: FieldInput<PnpmSettingType<"deployAllFiles">>;
	/** Whether the legacy deployment algorithm (copying files) is used instead of the default. */
	readonly forceLegacyDeploy?: FieldInput<PnpmSettingType<"forceLegacyDeploy">>;
	/** Whether the NODE_PATH environment variable is set when running scripts. */
	readonly extendNodePath?: FieldInput<PnpmSettingType<"extendNodePath">>;
	/** Whether symlinks to executables are created instead of shell shims on non-Windows systems. */
	readonly preferSymlinkedExecutables?: FieldInput<PnpmSettingType<"preferSymlinkedExecutables">>;
	/** Whether the built-in compatibility database of lifecycle script overrides is ignored. */
	readonly ignoreCompatibilityDb?: FieldInput<PnpmSettingType<"ignoreCompatibilityDb">>;
	/** Whether pnpm skips integrity checks when the lockfile is up to date to speed up repeat installs. */
	readonly optimisticRepeatInstall?: FieldInput<PnpmSettingType<"optimisticRepeatInstall">>;
	/** Whether pnpm installs all projects in the workspace when running install in a workspace. */
	readonly recursiveInstall?: FieldInput<PnpmSettingType<"recursiveInstall">>;
	/** Whether pnpm fails if a dependency's engines field is incompatible with the current Node.js version. */
	readonly engineStrict?: FieldInput<PnpmSettingType<"engineStrict">>;
	/** Maximum number of concurrent network requests pnpm is allowed to make. */
	readonly networkConcurrency?: FieldInput<PnpmSettingType<"networkConcurrency">>;
	/** Number of times pnpm retries fetching a package from the registry on failure. */
	readonly fetchRetries?: FieldInput<PnpmSettingType<"fetchRetries">>;
	/** Exponential factor used when calculating retry delays for failed fetches. */
	readonly fetchRetryFactor?: FieldInput<PnpmSettingType<"fetchRetryFactor">>;
	/** Minimum timeout (ms) for a single fetch retry attempt. */
	readonly fetchRetryMintimeout?: FieldInput<PnpmSettingType<"fetchRetryMintimeout">>;
	/** Maximum timeout (ms) for a single fetch retry attempt. */
	readonly fetchRetryMaxtimeout?: FieldInput<PnpmSettingType<"fetchRetryMaxtimeout">>;
	/** Maximum amount of time (ms) to wait for an HTTP response from the registry. */
	readonly fetchTimeout?: FieldInput<PnpmSettingType<"fetchTimeout">>;
	/** Hosts from which git-protocol dependencies are cloned using a shallow fetch. */
	readonly gitShallowHosts?: FieldInput<PnpmSettingType<"gitShallowHosts">>;
	/** Whether packages are published with provenance attestation when supported by the registry. */
	readonly provenance?: FieldInput<PnpmSettingType<"provenance">>;
	/** Whether pnpm checks that the repository is clean before publishing. */
	readonly gitChecks?: FieldInput<PnpmSettingType<"gitChecks">>;
	/** Whether the README file is embedded in the package tarball on publish. */
	readonly embedReadme?: FieldInput<PnpmSettingType<"embedReadme">>;
	/** Branch that is allowed to publish packages; publishing from other branches is blocked. */
	readonly publishBranch?: FieldInput<PnpmSettingType<"publishBranch">>;
}
