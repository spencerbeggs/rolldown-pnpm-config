import { Data, Effect, Schema } from "effect";
import type { PluginConfig } from "../define-plugin.js";
import type { FrozenConfig } from "../runtime/index.js";

/**
 * Typed failure for invalid plugin configuration, surfaced as a build error.
 *
 * @internal
 */
export class ConfigError extends Data.TaggedError("ConfigError")<{ readonly message: string }> {}

const CatalogsSchema = Schema.Record({
	key: Schema.String,
	value: Schema.Record({ key: Schema.String, value: Schema.String }),
});

/**
 * Validate and freeze the plugin config into plain data. The only place Effect
 * runs; invoked once at build time inside the plugin.
 */
export function freeze(config: PluginConfig): Effect.Effect<FrozenConfig, ConfigError> {
	return Effect.gen(function* () {
		const catalogs = yield* Schema.decodeUnknown(CatalogsSchema)(config.catalogs.catalogs).pipe(
			Effect.mapError((error) => new ConfigError({ message: `Invalid catalogs: ${String(error)}` })),
		);
		return { catalogs };
	});
}
