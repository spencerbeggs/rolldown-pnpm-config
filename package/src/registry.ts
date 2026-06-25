import type { Enforcement } from "./runtime/types.js";

/**
 * Maps each known pnpm field to its strategy + Silk-matching default
 * enforcement.
 *
 * @internal
 */
export const FIELD_REGISTRY: Record<string, { readonly strategy: string; readonly enforcement: Enforcement }> = {
	catalogs: { strategy: "catalogs", enforcement: "warn" },
	confirmModulesPurge: { strategy: "scalar", enforcement: "absent" },
	packageExtensions: { strategy: "mapChildWins", enforcement: "absent" },
	allowedDeprecatedVersions: { strategy: "mapChildWins", enforcement: "absent" },
	publicHoistPattern: { strategy: "arrayUnion", enforcement: "absent" },
	minimumReleaseAgeExclude: { strategy: "arrayUnion", enforcement: "absent" },
	supportedArchitectures: { strategy: "arrayRecordUnion", enforcement: "absent" },
	auditConfig: { strategy: "arrayRecordUnion", enforcement: "absent" },
	overrides: { strategy: "overrides", enforcement: "warn" },
	peerDependencyRules: { strategy: "peerDependencyRules", enforcement: "warn" },
	strictDepBuilds: { strategy: "securityFlag", enforcement: "warn" },
	blockExoticSubdeps: { strategy: "securityFlag", enforcement: "warn" },
	minimumReleaseAge: { strategy: "securityMin", enforcement: "warn" },
	allowBuilds: { strategy: "allowBuilds", enforcement: "warn" },
};
