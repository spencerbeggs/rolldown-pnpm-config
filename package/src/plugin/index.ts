import { Effect } from "effect";
import type { Plugin } from "rolldown";
import type { PluginConfig } from "../define-plugin.js";
import type { FrozenConfig } from "../runtime/index.js";
import type { ConfigError } from "./freeze.js";
import { freeze } from "./freeze.js";
import { emitCatalogsModule, emitPnpmfileModule } from "./serialize.js";

const PNPMFILE_SPEC = "rolldown-pnpm-config/virtual/pnpmfile";
const CATALOGS_SPEC = "rolldown-pnpm-config/virtual/catalogs";

/**
 * Internal seam: lets tests inject a freeze spy to assert single-evaluation.
 *
 * @internal
 */
export interface PluginDeps {
	/** Injectable freeze function; defaults to the real Effect implementation. */
	readonly freeze: (config: PluginConfig) => Effect.Effect<FrozenConfig, ConfigError>;
}

/**
 * Internal factory for the rolldown plugin. Accepts an optional DI seam for
 * testing (freeze spy). The Effect freeze runs once (memoized) and is reused
 * across every tsdown pass (JS, dts, declarations, looseFiles).
 *
 * @internal
 */
export function createPnpmConfigPlugin(config: PluginConfig, deps: PluginDeps = { freeze }): Plugin {
	let frozen: Promise<FrozenConfig> | undefined;
	const getFrozen = (): Promise<FrozenConfig> => (frozen ??= Effect.runPromise(deps.freeze(config)));

	return {
		name: "rolldown-pnpm-config",
		resolveId(source) {
			if (source === PNPMFILE_SPEC || source === CATALOGS_SPEC) {
				return `\0${source}`;
			}
			return null;
		},
		async load(id) {
			if (id === `\0${PNPMFILE_SPEC}`) {
				return emitPnpmfileModule(await getFrozen());
			}
			if (id === `\0${CATALOGS_SPEC}`) {
				return emitCatalogsModule((await getFrozen()).catalogs);
			}
			return null;
		},
	};
}

/**
 * Rolldown plugin that serves the two virtual pnpm-config modules. Pass a
 * `PluginConfig` (built with `definePlugin`) and the plugin handles the rest.
 *
 * @public
 */
export function PnpmConfigPlugin(config: PluginConfig): Plugin {
	return createPnpmConfigPlugin(config);
}
