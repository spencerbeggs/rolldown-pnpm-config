import type { CatalogsResult } from "./define-catalogs.js";

/**
 * The declarative plugin configuration. M1: catalogs only.
 *
 * @public
 */
export interface PluginConfig {
	/** The resolved catalogs to inject into pnpm config. */
	readonly catalogs: CatalogsResult;
}

/**
 * Identity-with-types builder for the plugin configuration.
 *
 * @public
 */
export function definePlugin(input: PluginConfig): PluginConfig {
	return { catalogs: input.catalogs };
}
