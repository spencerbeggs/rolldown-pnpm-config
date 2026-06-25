import { Data, Effect, Schema } from "effect";
import type { PluginConfig } from "../define-plugin.js";
import { FIELD_REGISTRY } from "../registry.js";
import type { Base, Enforcement, Manifest } from "../runtime/types.js";

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

const StringRecord = Schema.Record({ key: Schema.String, value: Schema.String });
const BooleanRecord = Schema.Record({ key: Schema.String, value: Schema.Boolean });
const StringArray = Schema.Array(Schema.String);
const StringArrayRecord = Schema.Record({ key: Schema.String, value: StringArray });
const UnknownRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown });
const PeerRulesSchema = Schema.Struct({
	allowedVersions: Schema.optional(StringRecord),
	ignoreMissing: Schema.optional(StringArray),
	allowAny: Schema.optional(StringArray),
});

/** Per-field value-shape schemas; only declared fields are validated. */
const FIELD_SCHEMAS: Record<string, Schema.Schema<unknown, unknown>> = {
	confirmModulesPurge: Schema.Boolean,
	strictDepBuilds: Schema.Boolean,
	blockExoticSubdeps: Schema.Boolean,
	minimumReleaseAge: Schema.Number,
	packageExtensions: UnknownRecord,
	allowedDeprecatedVersions: StringRecord,
	publicHoistPattern: StringArray,
	minimumReleaseAgeExclude: StringArray,
	supportedArchitectures: StringArrayRecord,
	auditConfig: StringArrayRecord,
	overrides: StringRecord,
	allowBuilds: BooleanRecord,
	peerDependencyRules: PeerRulesSchema,
} as Record<string, Schema.Schema<unknown, unknown>>;

interface FieldDecl {
	readonly value: unknown;
	readonly enforcement?: Enforcement;
	readonly options?: Record<string, unknown>;
}

function normalizeField(input: unknown): FieldDecl {
	if (input !== null && typeof input === "object" && "value" in (input as object)) {
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
export function freeze(config: PluginConfig): Effect.Effect<{ base: Base; manifest: Manifest }, ConfigError> {
	return Effect.gen(function* () {
		const base: Base = {};
		const manifest: Manifest = {};
		// catalogs is always present and special: its value is the resolved map.
		base.catalogs = yield* Schema.decodeUnknown(CatalogsSchema)(config.catalogs.catalogs).pipe(
			Effect.mapError((error) => new ConfigError({ message: `Invalid catalogs: ${String(error)}` })),
		);
		manifest.catalogs = { strategy: "catalogs", enforcement: "warn" };
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
		if (base.catalogs === undefined) {
			return yield* new ConfigError({ message: "catalogs is required" });
		}
		return { base, manifest };
	});
}
