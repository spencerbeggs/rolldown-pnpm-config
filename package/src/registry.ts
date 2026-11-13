import type { PnpmSettingName } from "@effected/pnpm/settings";
import { PnpmSettingsCatalog } from "@effected/pnpm/settings";
import type { Schema } from "effect";
import type { Enforcement } from "./runtime/types.js";

/**
 * This plugin's policy over one pnpm setting: how a managed value merges with
 * a consumer's local one at install time, and how a divergence is reported.
 *
 * @internal
 */
export interface FieldPolicy {
	/** The runtime merge strategy, a key of the runtime strategy table. */
	readonly strategy: string;
	/** The default enforcement when the config does not wrap the field with its own. */
	readonly enforcement: Enforcement;
}

/**
 * Every pnpm setting the plugin manages, with its policy. The facts about each
 * setting (its schema, where pnpm reads it, its documentation) come from
 * `@effected/pnpm/settings`; this table holds only what the plugin decides.
 *
 * @remarks
 * `satisfies` against the catalog's key set makes a setting the catalog does
 * not know (a phantom, or one pnpm 12 stopped reading) a compile error here,
 * so the plugin cannot offer a setting pnpm would ignore.
 *
 * @internal
 */
export const FIELD_REGISTRY = {
	catalogs: { strategy: "catalogs", enforcement: "warn" },
	packageExtensions: { strategy: "mapChildWins", enforcement: "absent" },
	allowedDeprecatedVersions: { strategy: "mapChildWins", enforcement: "absent" },
	publicHoistPattern: { strategy: "arrayUnion", enforcement: "absent" },
	minimumReleaseAgeExclude: { strategy: "arrayUnion", enforcement: "absent" },
	supportedArchitectures: { strategy: "arrayRecordUnion", enforcement: "absent" },
	audit: { strategy: "sectionMerge", enforcement: "absent" },
	auditConfig: { strategy: "arrayRecordUnion", enforcement: "absent" },
	overrides: { strategy: "overrides", enforcement: "warn" },
	peerDependencyRules: { strategy: "peerDependencyRules", enforcement: "warn" },
	strictDepBuilds: { strategy: "securityFlag", enforcement: "warn" },
	blockExoticSubdeps: { strategy: "securityFlag", enforcement: "warn" },
	minimumReleaseAge: { strategy: "securityMin", enforcement: "warn" },
	allowBuilds: { strategy: "allowBuilds", enforcement: "warn" },
	ignoredOptionalDependencies: { strategy: "arrayUnion", enforcement: "absent" },
	update: { strategy: "sectionMerge", enforcement: "absent" },
	updateConfig: { strategy: "mapChildWins", enforcement: "absent" },
	catalog: { strategy: "mapChildWins", enforcement: "warn" },
	minimumReleaseAgeStrict: { strategy: "scalar", enforcement: "warn" },
	minimumReleaseAgeIgnoreMissingTime: { strategy: "scalar", enforcement: "warn" },
	trustPolicy: { strategy: "scalar", enforcement: "warn" },
	trustPolicyExclude: { strategy: "arrayUnion", enforcement: "warn" },
	trustPolicyIgnoreAfter: { strategy: "scalar", enforcement: "warn" },
	trustLockfile: { strategy: "scalar", enforcement: "warn" },
	hoist: { strategy: "scalar", enforcement: "absent" },
	hoistWorkspacePackages: { strategy: "scalar", enforcement: "absent" },
	hoistPattern: { strategy: "arrayUnion", enforcement: "absent" },
	shamefullyHoist: { strategy: "scalar", enforcement: "absent" },
	hoistingLimits: { strategy: "scalar", enforcement: "absent" },
	modulesDir: { strategy: "scalar", enforcement: "absent" },
	nodeLinker: { strategy: "scalar", enforcement: "absent" },
	symlink: { strategy: "scalar", enforcement: "absent" },
	enableModulesDir: { strategy: "scalar", enforcement: "absent" },
	virtualStoreDir: { strategy: "scalar", enforcement: "absent" },
	virtualStoreDirMaxLength: { strategy: "scalar", enforcement: "absent" },
	virtualStoreOnly: { strategy: "scalar", enforcement: "absent" },
	packageImportMethod: { strategy: "scalar", enforcement: "absent" },
	modulesCacheMaxAge: { strategy: "scalar", enforcement: "absent" },
	dlxCacheMaxAge: { strategy: "scalar", enforcement: "absent" },
	verifyStoreIntegrity: { strategy: "scalar", enforcement: "warn" },
	strictStorePkgContentCheck: { strategy: "scalar", enforcement: "warn" },
	lockfile: { strategy: "scalar", enforcement: "absent" },
	preferFrozenLockfile: { strategy: "scalar", enforcement: "absent" },
	lockfileIncludeTarballUrl: { strategy: "scalar", enforcement: "absent" },
	gitBranchLockfile: { strategy: "scalar", enforcement: "absent" },
	mergeGitBranchLockfilesBranchPattern: { strategy: "arrayUnion", enforcement: "absent" },
	peersSuffixMaxLength: { strategy: "scalar", enforcement: "absent" },
	sharedWorkspaceLockfile: { strategy: "scalar", enforcement: "absent" },
	autoInstallPeers: { strategy: "scalar", enforcement: "absent" },
	dedupePeerDependents: { strategy: "scalar", enforcement: "absent" },
	dedupePeers: { strategy: "scalar", enforcement: "absent" },
	strictPeerDependencies: { strategy: "scalar", enforcement: "absent" },
	resolvePeersFromWorkspaceRoot: { strategy: "scalar", enforcement: "absent" },
	dangerouslyAllowAllBuilds: { strategy: "scalar", enforcement: "warn" },
	ignoreScripts: { strategy: "scalar", enforcement: "absent" },
	childConcurrency: { strategy: "scalar", enforcement: "absent" },
	sideEffectsCache: { strategy: "scalar", enforcement: "absent" },
	sideEffectsCacheReadonly: { strategy: "scalar", enforcement: "absent" },
	nodeOptions: { strategy: "scalar", enforcement: "absent" },
	verifyDepsBeforeRun: { strategy: "scalar", enforcement: "absent" },
	enablePrePostScripts: { strategy: "scalar", enforcement: "absent" },
	scriptShell: { strategy: "scalar", enforcement: "absent" },
	shellEmulator: { strategy: "scalar", enforcement: "absent" },
	requiredScripts: { strategy: "arrayUnion", enforcement: "absent" },
	patchedDependencies: { strategy: "mapChildWins", enforcement: "warn" },
	allowUnusedPatches: { strategy: "scalar", enforcement: "absent" },
	patchesDir: { strategy: "scalar", enforcement: "absent" },
	configDependencies: { strategy: "mapChildWins", enforcement: "absent" },
	injectWorkspacePackages: { strategy: "scalar", enforcement: "absent" },
	syncInjectedDepsAfterScripts: { strategy: "arrayUnion", enforcement: "absent" },
	dedupeInjectedDeps: { strategy: "scalar", enforcement: "absent" },
	pmOnFail: { strategy: "scalar", enforcement: "absent" },
	runtimeOnFail: { strategy: "scalar", enforcement: "absent" },
	nodeVersion: { strategy: "scalar", enforcement: "absent" },
	nodeDownloadMirrors: { strategy: "mapChildWins", enforcement: "absent" },
	catalogMode: { strategy: "scalar", enforcement: "absent" },
	cleanupUnusedCatalogs: { strategy: "scalar", enforcement: "absent" },
	linkWorkspacePackages: { strategy: "scalar", enforcement: "absent" },
	preferWorkspacePackages: { strategy: "scalar", enforcement: "absent" },
	saveWorkspaceProtocol: { strategy: "scalar", enforcement: "absent" },
	includeWorkspaceRoot: { strategy: "scalar", enforcement: "absent" },
	ignoreWorkspaceCycles: { strategy: "scalar", enforcement: "absent" },
	disallowWorkspaceCycles: { strategy: "scalar", enforcement: "absent" },
	workspaceConcurrency: { strategy: "scalar", enforcement: "absent" },
	auditLevel: { strategy: "scalar", enforcement: "absent" },
	resolutionMode: { strategy: "scalar", enforcement: "absent" },
	savePrefix: { strategy: "scalar", enforcement: "absent" },
	saveExact: { strategy: "scalar", enforcement: "absent" },
	tag: { strategy: "scalar", enforcement: "absent" },
	preferOffline: { strategy: "scalar", enforcement: "absent" },
	dedupeDirectDeps: { strategy: "scalar", enforcement: "absent" },
	deployAllFiles: { strategy: "scalar", enforcement: "absent" },
	forceLegacyDeploy: { strategy: "scalar", enforcement: "absent" },
	extendNodePath: { strategy: "scalar", enforcement: "absent" },
	preferSymlinkedExecutables: { strategy: "scalar", enforcement: "absent" },
	ignoreCompatibilityDb: { strategy: "scalar", enforcement: "absent" },
	optimisticRepeatInstall: { strategy: "scalar", enforcement: "absent" },
	recursiveInstall: { strategy: "scalar", enforcement: "absent" },
	engineStrict: { strategy: "scalar", enforcement: "absent" },
	networkConcurrency: { strategy: "scalar", enforcement: "absent" },
	fetchRetries: { strategy: "scalar", enforcement: "absent" },
	fetchRetryFactor: { strategy: "scalar", enforcement: "absent" },
	fetchRetryMintimeout: { strategy: "scalar", enforcement: "absent" },
	fetchRetryMaxtimeout: { strategy: "scalar", enforcement: "absent" },
	fetchTimeout: { strategy: "scalar", enforcement: "absent" },
	gitShallowHosts: { strategy: "arrayUnion", enforcement: "absent" },
	provenance: { strategy: "scalar", enforcement: "absent" },
	gitChecks: { strategy: "scalar", enforcement: "absent" },
	embedReadme: { strategy: "scalar", enforcement: "absent" },
	publishBranch: { strategy: "scalar", enforcement: "absent" },
} as const satisfies Partial<Record<PnpmSettingName, FieldPolicy>>;

/**
 * A setting the plugin manages.
 *
 * @internal
 */
export type ManagedField = keyof typeof FIELD_REGISTRY;

/** Every managed field, in table order. @internal */
export const MANAGED_FIELDS: ReadonlyArray<ManagedField> = Object.keys(FIELD_REGISTRY) as ManagedField[];

/**
 * Each managed field's value schema, from the pnpm settings catalog.
 *
 * @internal
 */
export const FIELD_SCHEMAS: Readonly<Record<ManagedField, Schema.Codec<unknown, unknown>>> = Object.fromEntries(
	MANAGED_FIELDS.map((field) => [field, PnpmSettingsCatalog.entries[field].schema as Schema.Codec<unknown, unknown>]),
) as Record<ManagedField, Schema.Codec<unknown, unknown>>;

/**
 * The managed fields that belong in `pnpm-workspace.yaml`: those pnpm 12 reads
 * from that file, per the catalog's `locations`.
 *
 * @internal
 */
export const WORKSPACE_FIELDS: ReadonlySet<string> = new Set(
	MANAGED_FIELDS.filter((field) => PnpmSettingsCatalog.entries[field].locations.includes("workspace")),
);
