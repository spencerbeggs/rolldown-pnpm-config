/**
 * Minimal pnpm config shape — only the fields this plugin reads/writes.
 *
 * @public
 */
export interface PnpmConfig {
	/** Named catalogs injected into pnpm's workspace configuration. */
	catalogs?: Record<string, Record<string, string>>;
	[key: string]: unknown;
}

/**
 * The frozen, build-time-resolved plugin data shipped into the pnpmfile.
 *
 * @public
 */
export interface FrozenConfig {
	/** The resolved catalog map to merge into pnpm config at install time. */
	catalogs: Record<string, Record<string, string>>;
}

/**
 * The pnpm pnpmfile hooks object.
 *
 * @public
 */
export interface PnpmHooks {
	/** Merges frozen catalogs into the pnpm workspace config. */
	updateConfig(config: PnpmConfig): PnpmConfig;
}

/**
 * Build the pnpm hooks from frozen plugin data. Zero dependencies — bundled
 * verbatim into the shipped pnpmfile. Merges each frozen catalog into the
 * consumer's config; a local entry for the same package wins.
 *
 * @public
 */
export function createHooks(frozen: FrozenConfig): PnpmHooks {
	return {
		updateConfig(config) {
			const existing = config.catalogs ?? {};
			const merged: Record<string, Record<string, string>> = { ...existing };
			for (const [name, entries] of Object.entries(frozen.catalogs)) {
				merged[name] = { ...entries, ...(existing[name] ?? {}) };
			}
			return { ...config, catalogs: merged };
		},
	};
}
