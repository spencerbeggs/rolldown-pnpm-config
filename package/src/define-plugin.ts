import type { CatalogsResult } from "./define-catalogs.js";
import type { Enforcement } from "./runtime/types.js";

/**
 * A field value, bare or wrapped with an explicit enforcement override.
 *
 * @public
 */
export type FieldInput<T> = T | { readonly value: T; readonly enforcement?: Enforcement };

/**
 * The declarative plugin configuration.
 *
 * @public
 */
export interface PluginConfig {
	/** The resolved catalogs to inject into pnpm config. */
	readonly catalogs: CatalogsResult;
	/** Whether pnpm prompts before purging `node_modules`. */
	readonly confirmModulesPurge?: FieldInput<boolean>;
	/** Per-package manifest overrides merged into the dependency graph. */
	readonly packageExtensions?: FieldInput<Record<string, unknown>>;
	/** Deprecated versions explicitly allowed, keyed by package. */
	readonly allowedDeprecatedVersions?: FieldInput<Record<string, string>>;
	/**
	 * Glob patterns hoisted to the root `node_modules`. May carry an
	 * `excludeByRepo` refine: packages dropped from the merged hoist list when
	 * installed inside the named consuming repo.
	 */
	readonly publicHoistPattern?:
		| string[]
		| {
				readonly value: string[];
				readonly enforcement?: Enforcement;
				readonly excludeByRepo?: Record<string, string[]>;
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
}

/**
 * Identity-with-types builder for the plugin configuration.
 *
 * @public
 */
export function definePlugin(input: PluginConfig): PluginConfig {
	return input;
}
