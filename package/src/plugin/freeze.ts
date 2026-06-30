import { Data, Effect, Schema } from "effect";
import { normalizeCatalogs } from "../catalogs.js";
import type { PluginConfig } from "../define-plugin.js";
import { DESCRIPTORS, deriveSchemas } from "../descriptors/index.js";
import { FIELD_REGISTRY } from "../registry.js";
import type { Base, Enforcement, Manifest } from "../runtime/types.js";

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

/** True only when `input` is the wrapped form: a `value` key and no foreign keys.
 *  This disambiguates from a record-valued field that happens to contain a
 *  `value` key (e.g. `overrides: { value: ">=1", lodash: ">=4" }`), which has
 *  keys outside the recognized set and is therefore treated as a bare value. */
function isWrappedField(input: object): boolean {
	const keys = Object.keys(input);
	return keys.includes("value") && keys.every((k) => WRAPPED_KEYS.has(k));
}

function normalizeField(input: unknown): FieldDecl {
	if (input !== null && typeof input === "object" && isWrappedField(input)) {
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
		base.catalogs = yield* Schema.decodeUnknown(CatalogsSchema)(normalizeCatalogs(config.catalogs)).pipe(
			Effect.mapError((error) => new ConfigError({ message: `Invalid catalogs: ${String(error)}` })),
		);
		manifest.catalogs = { strategy: "catalogs", enforcement: "warn" };
		if (typeof config.name !== "string" || config.name.trim() === "") {
			return yield* Effect.fail(
				new ConfigError({ message: "Config `name` is required and must be a non-empty string" }),
			);
		}
		for (const [field, reg] of Object.entries(FIELD_REGISTRY)) {
			if (field === "catalogs") continue;
			const raw = (config as unknown as Record<string, unknown>)[field];
			if (raw === undefined) continue;
			const decl = normalizeField(raw);
			const schema = FIELD_SCHEMAS[field];
			base[field] = schema
				? yield* Schema.decodeUnknown(schema)(decl.value).pipe(
						Effect.mapError((error) => new ConfigError({ message: `Invalid ${field}: ${String(error)}` })),
					)
				: decl.value;
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
