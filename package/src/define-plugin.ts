import type { CatalogDeclaration } from "./catalogs.js";
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
	readonly strategy?: "union" | "difference";
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
		readonly [K in keyof PluginConfig]?: PluginConfig[K] | LocalDirective<PluginConfig[K]>;
	};
	/** Whether pnpm prompts before purging `node_modules`. */
	readonly confirmModulesPurge?: FieldInput<boolean>;
	/** Per-package manifest overrides merged into the dependency graph. */
	readonly packageExtensions?: FieldInput<Record<string, unknown>>;
	/** Deprecated versions explicitly allowed, keyed by package. */
	readonly allowedDeprecatedVersions?: FieldInput<Record<string, string>>;
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
	readonly minimumReleaseAgeExclude?: FieldInput<string[]>;
	/** Supported architectures, keyed by axis (`os`/`cpu`/`libc`). */
	readonly supportedArchitectures?: FieldInput<Record<string, string[]>>;
	/** Audit config exclusions, keyed by axis (`ignoreGhsas`/`ignoreCves`). */
	readonly auditConfig?: FieldInput<Record<string, string[]>>;
	/** Security version overrides, keyed by package selector. */
	readonly overrides?: FieldInput<Record<string, string>>;
	/** Peer dependency rules: allowed versions plus ignore/allow-any lists. */
	readonly peerDependencyRules?: FieldInput<{
		readonly allowedVersions?: Record<string, string>;
		readonly ignoreMissing?: string[];
		readonly allowAny?: string[];
	}>;
	/** Whether dependency build scripts are blocked unless explicitly allowed. */
	readonly strictDepBuilds?: FieldInput<boolean>;
	/** Whether exotic (non-registry) subdependencies are blocked. */
	readonly blockExoticSubdeps?: FieldInput<boolean>;
	/** Minimum age (minutes) a release must reach before it is installable. */
	readonly minimumReleaseAge?: FieldInput<number>;
	/** Packages whose build scripts are explicitly allowed to run. */
	readonly allowBuilds?: FieldInput<Record<string, boolean>>;
	/** Optional dependencies excluded from installation entirely. */
	readonly ignoredOptionalDependencies?: FieldInput<string[]>;
	/** Per-dependency update behavior: which packages to ignore during updates. */
	readonly updateConfig?: FieldInput<{ ignoreDependencies?: string[] }>;
	/** Default version catalog entries merged as a single `default` catalog. */
	readonly catalog?: FieldInput<Record<string, string>>;
	/** Whether any resolution fails when a package violates minimum-release-age. */
	readonly minimumReleaseAgeStrict?: FieldInput<boolean>;
	/** Whether to skip the release-age check when publish-time metadata is absent. */
	readonly minimumReleaseAgeIgnoreMissingTime?: FieldInput<boolean>;
	/** Defines what package integrity verification is enforced on installs. */
	readonly trustPolicy?: FieldInput<"off" | "no-downgrade">;
	/** Packages excluded from trust-policy enforcement. */
	readonly trustPolicyExclude?: FieldInput<string[]>;
	/** Minutes after installation after which the trust check is skipped. */
	readonly trustPolicyIgnoreAfter?: FieldInput<number>;
	/** Whether the lockfile alone is trusted without re-verifying each package's integrity. */
	readonly trustLockfile?: FieldInput<boolean>;
	/** Whether packages are hoisted to the virtual store root node_modules. */
	readonly hoist?: FieldInput<boolean>;
	/** Whether workspace packages are hoisted to the root node_modules. */
	readonly hoistWorkspacePackages?: FieldInput<boolean>;
	/** Glob patterns describing which packages are hoisted to the virtual store root. */
	readonly hoistPattern?: FieldInput<string[]>;
	/** Whether all packages are hoisted to the root node_modules (shameful flat layout). */
	readonly shamefullyHoist?: FieldInput<boolean>;
	/** Defines the scope to which dependencies are hoisted. */
	readonly hoistingLimits?: FieldInput<"none" | "workspaces" | "dependencies">;
	/** The directory in which node_modules will be created. */
	readonly modulesDir?: FieldInput<string>;
	/** Defines which linker is used for installing Node.js packages. */
	readonly nodeLinker?: FieldInput<"isolated" | "hoisted" | "pnp">;
	/** Whether symlinks are created when linking packages from the store. */
	readonly symlink?: FieldInput<boolean>;
	/** Whether the local node_modules directory should be created during install. */
	readonly enableModulesDir?: FieldInput<boolean>;
	/** The directory with links to the store (default: node_modules/.pnpm). */
	readonly virtualStoreDir?: FieldInput<string>;
	/** Maximum allowed length of directory names inside the virtual store. */
	readonly virtualStoreDirMaxLength?: FieldInput<number>;
	/** Whether packages are written only to the virtual store without a local modules dir. */
	readonly virtualStoreOnly?: FieldInput<boolean>;
	/** Controls how packages are imported from the content-addressable store. */
	readonly packageImportMethod?: FieldInput<"auto" | "hardlink" | "copy" | "clone" | "clone-or-copy">;
	/** Maximum age (minutes) of unused modules directories before they are pruned. */
	readonly modulesCacheMaxAge?: FieldInput<number>;
	/** Maximum age (minutes) of cached dlx command results before re-fetch. */
	readonly dlxCacheMaxAge?: FieldInput<number>;
	/** Whether integrity checksums in the store are verified before using a package. */
	readonly verifyStoreIntegrity?: FieldInput<boolean>;
	/** Whether store package content checksums are verified strictly on each access. */
	readonly strictStorePkgContentCheck?: FieldInput<boolean>;
	/** Whether a lockfile is used and generated when running commands that install packages. */
	readonly lockfile?: FieldInput<boolean>;
	/** If true, pnpm does not generate a lockfile and fails if the lockfile is out of date. */
	readonly preferFrozenLockfile?: FieldInput<boolean>;
	/** Whether the lockfile includes the full tarball URL for each resolved dependency. */
	readonly lockfileIncludeTarballUrl?: FieldInput<boolean>;
	/** When enabled, the generated lockfile name is based on the current branch name. */
	readonly gitBranchLockfile?: FieldInput<boolean>;
	/** Branch name patterns whose lockfiles are merged into the main lockfile on install. */
	readonly mergeGitBranchLockfilesBranchPattern?: FieldInput<string[]>;
	/** Maximum length of the peers suffix appended to dependency directory names in the virtual store. */
	readonly peersSuffixMaxLength?: FieldInput<number>;
	/** Whether a single shared lockfile is used for all projects in the workspace. */
	readonly sharedWorkspaceLockfile?: FieldInput<boolean>;
	/** Whether missing peer dependencies are installed automatically. */
	readonly autoInstallPeers?: FieldInput<boolean>;
	/** Whether packages with peer dependencies are deduplicated after peers are resolved. */
	readonly dedupePeerDependents?: FieldInput<boolean>;
	/** Whether peer dependencies are deduplicated during resolution. */
	readonly dedupePeers?: FieldInput<boolean>;
	/** If true, commands fail when there are missing or invalid peer dependencies. */
	readonly strictPeerDependencies?: FieldInput<boolean>;
	/** Whether peer dependencies are resolved using packages installed in the workspace root. */
	readonly resolvePeersFromWorkspaceRoot?: FieldInput<boolean>;
	/** Packages whose build scripts are allowed to run; others are blocked. */
	readonly onlyBuiltDependencies?: FieldInput<string[]>;
	/** Path to a JSON file listing packages whose build scripts are allowed. */
	readonly onlyBuiltDependenciesFile?: FieldInput<string>;
	/** Packages whose build scripts are never executed. */
	readonly neverBuiltDependencies?: FieldInput<string[]>;
	/** Packages excluded from the list of dependencies to build. */
	readonly ignoredBuiltDependencies?: FieldInput<string[]>;
	/** When true, all build scripts are allowed to run without restriction. */
	readonly dangerouslyAllowAllBuilds?: FieldInput<boolean>;
	/** Whether lifecycle scripts of packages in node_modules are not executed. */
	readonly ignoreScripts?: FieldInput<boolean>;
	/** Whether lifecycle scripts of dependencies are ignored during install. */
	readonly ignoreDepScripts?: FieldInput<boolean>;
	/** Maximum number of child processes that build scripts can spawn concurrently. */
	readonly childConcurrency?: FieldInput<number>;
	/** Whether the results of running install scripts are cached. */
	readonly sideEffectsCache?: FieldInput<boolean>;
	/** Whether the side effects cache is used but never updated. */
	readonly sideEffectsCacheReadonly?: FieldInput<boolean>;
	/** Options passed to Node.js via NODE_OPTIONS when running scripts. */
	readonly nodeOptions?: FieldInput<string>;
	/** Whether pnpm verifies that the install is up to date before running scripts. */
	readonly verifyDepsBeforeRun?: FieldInput<"install" | "warn" | "error" | "prompt" | boolean>;
	/** Whether pre/post lifecycle scripts are run automatically alongside the main script. */
	readonly enablePrePostScripts?: FieldInput<boolean>;
	/** The shell used to execute scripts. */
	readonly scriptShell?: FieldInput<string>;
	/** Whether a POSIX shell emulator is used when running scripts on Windows. */
	readonly shellEmulator?: FieldInput<boolean>;
	/** Scripts that must exist in every project matching the current filter. */
	readonly requiredScripts?: FieldInput<string[]>;
	/** Patches applied to dependencies, keyed by package identifier. */
	readonly patchedDependencies?: FieldInput<Record<string, string>>;
	/** Whether unused patches (patches that apply to no installed package) are allowed. */
	readonly allowUnusedPatches?: FieldInput<boolean>;
	/** Whether non-applied patches (patches that fail to apply) are allowed. */
	readonly allowNonAppliedPatches?: FieldInput<boolean>;
	/** Whether patch failures are silently ignored during installation. */
	readonly ignorePatchFailures?: FieldInput<boolean>;
	/** Directory where patch files are stored (default: patches). */
	readonly patchesDir?: FieldInput<string>;
	/** Packages installed before other packages so their config scripts can run first. */
	readonly configDependencies?: FieldInput<Record<string, string>>;
	/** Environment variables applied when running scripts. */
	readonly executionEnv?: FieldInput<Record<string, unknown>>;
	/** Whether local workspace packages are injected instead of symlinked. */
	readonly injectWorkspacePackages?: FieldInput<boolean>;
	/** Scripts after which injected dependencies are re-synced. */
	readonly syncInjectedDepsAfterScripts?: FieldInput<string[]>;
	/** Whether injected workspace packages are deduplicated. */
	readonly dedupeInjectedDeps?: FieldInput<boolean>;
	/** Whether pnpm enforces use of the package manager specified in packageManager. */
	readonly packageManagerStrict?: FieldInput<boolean>;
	/** Whether pnpm enforces the exact version of the package manager specified in packageManager. */
	readonly packageManagerStrictVersion?: FieldInput<boolean>;
	/** Whether pnpm automatically downloads and uses the version of pnpm specified in packageManager. */
	readonly managePackageManagerVersions?: FieldInput<boolean>;
	/** Action taken when the package manager version does not match the packageManager field. */
	readonly pmOnFail?: FieldInput<"download" | "error" | "warn" | "ignore">;
	/** Action taken when the Node.js version does not match the engines.node field. */
	readonly runtimeOnFail?: FieldInput<"download" | "error" | "warn" | "ignore">;
	/** The Node.js version to use when checking packages' engines field. */
	readonly nodeVersion?: FieldInput<string>;
	/** The exact Node.js version that pnpm should use for running scripts. */
	readonly useNodeVersion?: FieldInput<string>;
	/** Mirror URLs for downloading Node.js, keyed by distribution name. */
	readonly nodeDownloadMirrors?: FieldInput<Record<string, unknown>>;
	/** Controls how dependencies are resolved against entries defined in the catalogs field. */
	readonly catalogMode?: FieldInput<"strict" | "prefer" | "manual">;
	/** Whether pnpm removes catalog entries that are not used by any project in the workspace. */
	readonly cleanupUnusedCatalogs?: FieldInput<boolean>;
	/** Whether workspace packages are linked from the workspace, not downloaded from the registry. */
	readonly linkWorkspacePackages?: FieldInput<boolean | "deep">;
	/** Whether versions of packages from the workspace are preferred over versions from the registry. */
	readonly preferWorkspacePackages?: FieldInput<boolean>;
	/** Controls whether the workspace: range protocol is used when saving workspace package versions. */
	readonly saveWorkspaceProtocol?: FieldInput<boolean | "rolling">;
	/** Whether tasks of the root workspace project are included when executing commands recursively. */
	readonly includeWorkspaceRoot?: FieldInput<boolean>;
	/** Whether workspace dependency cycles are silently ignored. */
	readonly ignoreWorkspaceCycles?: FieldInput<boolean>;
	/** Whether an error is thrown when a workspace dependency cycle is detected. */
	readonly disallowWorkspaceCycles?: FieldInput<boolean>;
	/** Number of projects built in parallel when running commands recursively. */
	readonly workspaceConcurrency?: FieldInput<number>;
	/** Minimum severity level for audit reports (low, moderate, high, critical). */
	readonly auditLevel?: FieldInput<"low" | "moderate" | "high" | "critical">;
	/** Algorithm used to resolve dependencies from the registry. */
	readonly resolutionMode?: FieldInput<"highest" | "time-based" | "lowest-direct">;
	/** Version prefix prepended to package versions saved in package.json. */
	readonly savePrefix?: FieldInput<"^" | "~" | "">;
	/** Whether packages are saved with an exact version instead of a semver range. */
	readonly saveExact?: FieldInput<boolean>;
	/** The default tag used when adding packages without a specified version. */
	readonly tag?: FieldInput<string>;
	/** Whether cached data is used without network requests, failing only if data is missing. */
	readonly preferOffline?: FieldInput<boolean>;
	/** Whether direct dependencies are deduplicated when they can be satisfied by an existing dependency. */
	readonly dedupeDirectDeps?: FieldInput<boolean>;
	/** Whether all files of a deployed package are copied including those in node_modules. */
	readonly deployAllFiles?: FieldInput<boolean>;
	/** Whether the legacy deployment algorithm (copying files) is used instead of the default. */
	readonly forceLegacyDeploy?: FieldInput<boolean>;
	/** Whether the NODE_PATH environment variable is set when running scripts. */
	readonly extendNodePath?: FieldInput<boolean>;
	/** Whether symlinks to executables are created instead of shell shims on non-Windows systems. */
	readonly preferSymlinkedExecutables?: FieldInput<boolean>;
	/** Whether the built-in compatibility database of lifecycle script overrides is ignored. */
	readonly ignoreCompatibilityDb?: FieldInput<boolean>;
	/** Whether pnpm skips integrity checks when the lockfile is up to date to speed up repeat installs. */
	readonly optimisticRepeatInstall?: FieldInput<boolean>;
	/** Whether pnpm installs all projects in the workspace when running install in a workspace. */
	readonly recursiveInstall?: FieldInput<boolean>;
	/** Whether pnpm fails if a dependency's engines field is incompatible with the current Node.js version. */
	readonly engineStrict?: FieldInput<boolean>;
	/** Maximum number of concurrent network requests pnpm is allowed to make. */
	readonly networkConcurrency?: FieldInput<number>;
	/** Number of times pnpm retries fetching a package from the registry on failure. */
	readonly fetchRetries?: FieldInput<number>;
	/** Exponential factor used when calculating retry delays for failed fetches. */
	readonly fetchRetryFactor?: FieldInput<number>;
	/** Minimum timeout (ms) for a single fetch retry attempt. */
	readonly fetchRetryMintimeout?: FieldInput<number>;
	/** Maximum timeout (ms) for a single fetch retry attempt. */
	readonly fetchRetryMaxtimeout?: FieldInput<number>;
	/** Maximum amount of time (ms) to wait for an HTTP response from the registry. */
	readonly fetchTimeout?: FieldInput<number>;
	/** Hosts from which git-protocol dependencies are cloned using a shallow fetch. */
	readonly gitShallowHosts?: FieldInput<string[]>;
	/** Whether packages are published with provenance attestation when supported by the registry. */
	readonly provenance?: FieldInput<boolean>;
	/** Whether pnpm checks that the repository is clean before publishing. */
	readonly gitChecks?: FieldInput<boolean>;
	/** Whether the README file is embedded in the package tarball on publish. */
	readonly embedReadme?: FieldInput<boolean>;
	/** Branch that is allowed to publish packages; publishing from other branches is blocked. */
	readonly publishBranch?: FieldInput<string>;
}
