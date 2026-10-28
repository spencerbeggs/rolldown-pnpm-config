import { Fmt } from "@effected/cli";
import { Data, Effect, Predicate, Schema } from "effect";
import { normalizeCatalogs } from "../catalogs.js";
import type { PluginConfig } from "../define-plugin.js";
import { DESCRIPTORS, deriveSchemas } from "../descriptors/index.js";
import { FIELD_REGISTRY } from "../registry.js";
import type { Base, Enforcement, Manifest } from "../runtime/types.js";
import { resolvePeerDependencyRules } from "./allowed-versions.js";
import { resolveOverrides } from "./overrides-from-catalogs.js";

/**
 * Typed failure for invalid plugin configuration, surfaced as a build error.
 *
 * @internal
 */
export class ConfigError extends Data.TaggedError("ConfigError")<{ readonly message: string }> {}

/** Per-field value-shape schemas; only declared fields are validated. */
const FIELD_SCHEMAS = deriveSchemas(DESCRIPTORS);
const CatalogsSchema = FIELD_SCHEMAS.catalogs;

interface FieldDecl {
	readonly value: unknown;
	readonly enforcement?: Enforcement;
	readonly options?: Record<string, unknown>;
}

/** Keys recognized by the wrapped `{ value, enforcement?, excludeByRepo? }` form. */
const WRAPPED_KEYS = new Set(["value", "enforcement", "excludeByRepo"]);

/**
 * True only when `input` is the wrapped `{ value, enforcement?, excludeByRepo? }`
 * form: a `value` key and no foreign keys. This disambiguates from a
 * record-valued field that happens to contain a `value` key (e.g.
 * `overrides: { value: ">=1", lodash: ">=4" }`), which has keys outside the
 * recognized set and is therefore treated as a bare value. The single
 * definition of "wrapped" — the CLI's static readers use it too.
 *
 * @internal
 */
export function isWrappedField(input: unknown): input is { value: unknown } {
	if (!Predicate.isObject(input)) return false;
	const keys = Object.keys(input);
	return keys.includes("value") && keys.every((k) => WRAPPED_KEYS.has(k));
}

function normalizeField(input: unknown): FieldDecl {
	if (isWrappedField(input)) {
		const o = input as { value: unknown; enforcement?: Enforcement; excludeByRepo?: unknown };
		return {
			value: o.value,
			...(o.enforcement !== undefined ? { enforcement: o.enforcement } : {}),
			...(o.excludeByRepo !== undefined ? { options: { excludeByRepo: o.excludeByRepo } } : {}),
		};
	}
	return { value: input };
}

/**
 * Validate + freeze the plugin config into base data + a strategy manifest. The
 * only place Effect runs; invoked once at build time inside the plugin.
 *
 * @internal
 */
export function freeze(
	config: PluginConfig,
): Effect.Effect<{ base: Base; manifest: Manifest; name: string }, ConfigError> {
	return Effect.gen(function* () {
		const base: Base = {};
		const manifest: Manifest = {};
		// catalogs is always present and special: normalize the inline declarations into
		// the resolved map (incl. materialized peer catalogs), then validate the shape.
		base.catalogs = yield* Schema.decodeUnknownEffect(CatalogsSchema)(normalizeCatalogs(config.catalogs)).pipe(
			Effect.mapError((error) => new ConfigError({ message: `Invalid catalogs: ${Fmt.describe(error)}` })),
		);
		manifest.catalogs = { strategy: "catalogs", enforcement: "warn" };
		if (typeof config.name !== "string" || config.name.trim() === "") {
			return yield* Effect.fail(
				new ConfigError({ message: "Config `name` is required and must be a non-empty string" }),
			);
		}
		const directiveError = (error: unknown) => new ConfigError({ message: Fmt.describe(error) });
		for (const [field, reg] of Object.entries(FIELD_REGISTRY)) {
			if (field === "catalogs") continue;
			let raw = (config as unknown as Record<string, unknown>)[field];
			// `overridesFromCatalogs` is a directive beside `overrides`, not a managed
			// field of its own: with it present, an unauthored `overrides` still
			// materializes so the derived table has somewhere to land.
			if (raw === undefined && field === "overrides" && config.overridesFromCatalogs !== undefined) raw = {};
			if (raw === undefined) continue;
			const decl = normalizeField(raw);
			const schema = FIELD_SCHEMAS[field];
			// Two fields carry build-time directives that derive entries from the
			// catalogs: `peerDependencyRules.allowedVersionsFromCatalogs` folds into
			// `allowedVersions` (and is stripped so the value passes the schema), and
			// `overridesFromCatalogs` folds under `overrides`. Both are baked into
			// `base` here, so the runtime pnpmfile, `export` and `preview` all emit them.
			const value =
				field === "peerDependencyRules"
					? yield* Effect.try({
							try: () => resolvePeerDependencyRules(decl.value, config.catalogs),
							catch: directiveError,
						})
					: field === "overrides"
						? yield* Effect.try({
								try: () => resolveOverrides(decl.value, config.overridesFromCatalogs, config.catalogs),
								catch: directiveError,
							})
						: decl.value;
			base[field] = schema
				? yield* Schema.decodeUnknownEffect(schema)(value).pipe(
						Effect.mapError((error) => new ConfigError({ message: `Invalid ${field}: ${Fmt.describe(error)}` })),
					)
				: value;
			manifest[field] = {
				strategy: reg.strategy,
				enforcement: decl.enforcement ?? reg.enforcement,
				...(decl.options ? { options: decl.options } : {}),
			};
		}
		// `base.catalogs` is unconditionally decoded above; a missing/invalid
		// catalogs map already fails as `Invalid catalogs: …`, so no further guard.
		return { base, manifest, name: config.name };
	});
}
