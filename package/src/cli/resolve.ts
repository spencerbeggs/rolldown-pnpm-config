import type { NpmConfigError, RegistryReadError } from "@effected/npm";
import { NpmConfig, NpmRegistry } from "@effected/npm";
import type { NpmTransportError } from "@effected/npm/node";
import { NpmHttpClient } from "@effected/npm/node";
import type { PartialReleaseAgeGate } from "@effected/pnpm";
import { PnpmSettings } from "@effected/pnpm";
import { Context, Data, DateTime, Effect, FileSystem, Layer, Option, Path } from "effect";

/**
 * Typed failure raised when a package's versions cannot be resolved.
 *
 * @internal
 */
export class ResolveError extends Data.TaggedError("ResolveError")<{
	readonly pkg: string;
	readonly message: string;
}> {}

/**
 * Resolves the published versions of a package from the registry, and the
 * release-age gate pnpm itself would apply. The Live implementation reads the
 * registry through `@effected/npm`'s `NpmRegistry`, with the npmrc pnpm would
 * read at the workspace root (scoped registries, auth, proxy and TLS
 * settings), and reads pnpm's own settings through `@effected/pnpm`'s
 * `PnpmSettings`.
 *
 * @internal
 */
export class RegistryResolver extends Context.Service<
	RegistryResolver,
	{
		readonly versions: (pkg: string) => Effect.Effect<string[], ResolveError>;
		/** Version to ISO-8601 publish time; the packument's `created` and `modified` keys are not included. */
		readonly times: (pkg: string) => Effect.Effect<Record<string, string>, ResolveError>;
		/** The version's `peerDependencies`; `{}` when it declares none or the version is not published. */
		readonly peerDependencies: (pkg: string, version: string) => Effect.Effect<Record<string, string>, ResolveError>;
		/**
		 * The release-age gate pnpm's own settings declare (`minimumReleaseAge`,
		 * `minimumReleaseAgeExclude`), or `null` when neither is set. An unset age
		 * is absent from the contribution, never `0`: the caller decides the
		 * fallback.
		 */
		readonly pnpmReleaseAge: () => Effect.Effect<PartialReleaseAgeGate | null, ResolveError>;
	}
>()("RegistryResolver") {}

/**
 * The process-derived inputs the Live resolver needs, read once at the edge
 * (`main.ts`) and passed down as plain values.
 *
 * @internal
 */
export interface RegistryResolverOptions {
	/** Where the run was invoked: the directory pnpm reads its settings and npmrc from. */
	readonly cwd: string;
	/** The environment (`process.env`): `pnpm_config_*`, `npm_config_*`, proxies, `HOME`. */
	readonly env: Readonly<Record<string, string | undefined>>;
	/** The platform (`process.platform`), for pnpm's global config directory. */
	readonly platform: string;
}

/**
 * Builds the `NpmRegistry` the Live resolver reads through, from the npm
 * configuration it loaded.
 *
 * @internal
 */
export type RegistryClient = (config: NpmConfig) => Layer.Layer<NpmRegistry, NpmTransportError, FileSystem.FileSystem>;

/**
 * The production registry client: `NpmRegistry` over `NpmHttpClient`, which
 * applies the npmrc's proxy, bypass, CA, `strict-ssl` and client-certificate
 * settings by pnpm's rules.
 *
 * @internal
 */
export function npmRegistryClient(env: Readonly<Record<string, string | undefined>>): RegistryClient {
	return (config) =>
		NpmRegistry.layer.pipe(Layer.provide(NpmHttpClient.layer(config, { env, packageManager: "pnpm" })));
}

/**
 * Turn pnpm's effective settings into this resolver's partial gate contribution.
 * `minimumReleaseAge` unset is absent (not an open gate); an empty exclude list
 * contributes nothing.
 *
 * @internal
 */
export function pnpmGateOf(settings: PnpmSettings): PartialReleaseAgeGate | null {
	const out: { ageMinutes?: number; exclude?: readonly string[] } = {};
	const age = settings.minimumReleaseAge;
	if (Option.isSome(age)) out.ageMinutes = age.value;
	const exclude = settings.minimumReleaseAgeExclude;
	if (exclude.length > 0) out.exclude = [...exclude];
	return out.ageMinutes === undefined && out.exclude === undefined ? null : out;
}

/** The message a failed registry read reports against `pkg`. */
const failedRead =
	(pkg: string) =>
	(error: RegistryReadError | NpmConfigError | NpmTransportError): ResolveError =>
		new ResolveError({ pkg, message: error.message });

/**
 * Live RegistryResolver: registry reads through `NpmRegistry`, the release-age
 * gate through `PnpmSettings`.
 *
 * @remarks
 * The npm configuration is the one pnpm reads: `NpmConfig.load` with
 * `workspaceRoot: true`, so a run from a workspace member still honours the
 * root `.npmrc`, and every read is routed through `NpmConfig.targetFor`, so a
 * scoped registry and its credential apply per package. The configuration,
 * the HTTP client and `PnpmSettings` each load lazily and once
 * (`Effect.cached`): an unreadable npmrc or a malformed `pnpm-workspace.yaml`
 * fails the reads that need it, typed as `ResolveError`, never layer
 * construction. A package the registry does not know fails `versions` and
 * `times` (an unresolvable name is reported, not read as "no versions").
 *
 * `client` is the seam for tests: `() => NpmRegistry.layerSeeded(seed)`
 * replaces the network while the npmrc loading and routing stay real. Each
 * call builds a new layer; bind the result to a `const`.
 *
 * @internal
 */
export function RegistryResolverLive(
	options: RegistryResolverOptions,
	client: RegistryClient = npmRegistryClient(options.env),
): Layer.Layer<RegistryResolver, never, FileSystem.FileSystem | Path.Path> {
	return Layer.effect(
		RegistryResolver,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const scope = yield* Effect.scope;
			const platform = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
				effect.pipe(Effect.provideService(FileSystem.FileSystem, fs), Effect.provideService(Path.Path, path));
			const pnpmSettings = yield* Effect.cached(
				platform(PnpmSettings.load({ cwd: options.cwd, env: options.env, platform: options.platform })),
			);
			// The registry's npm configuration and client, built once in the layer's
			// own scope so the HTTP dispatcher lives as long as the resolver.
			const registry = yield* Effect.cached(
				Effect.gen(function* () {
					const config = yield* platform(NpmConfig.load({ cwd: options.cwd, env: options.env, workspaceRoot: true }));
					const context = yield* Layer.buildWithScope(client(config), scope).pipe(
						Effect.provideService(FileSystem.FileSystem, fs),
					);
					return { config, service: Context.get(context, NpmRegistry) };
				}),
			);
			const notFound = (pkg: string) => new ResolveError({ pkg, message: `${pkg} is not on the registry` });
			return {
				versions: (pkg: string) =>
					registry.pipe(
						Effect.flatMap(({ config, service }) => service.versions(pkg, config.targetFor(pkg))),
						Effect.mapError(failedRead(pkg)),
						Effect.flatMap(
							Option.match({ onNone: () => Effect.fail(notFound(pkg)), onSome: (v) => Effect.succeed([...v]) }),
						),
					),
				times: (pkg: string) =>
					registry.pipe(
						Effect.flatMap(({ config, service }) => service.publishTimes(pkg, config.targetFor(pkg))),
						Effect.mapError(failedRead(pkg)),
						Effect.flatMap(
							Option.match({
								onNone: () => Effect.fail(notFound(pkg)),
								onSome: (entries) =>
									Effect.succeed(
										Object.fromEntries(entries.map((e) => [e.version, DateTime.formatIso(e.publishedAt)])),
									),
							}),
						),
					),
				peerDependencies: (pkg: string, version: string) =>
					registry.pipe(
						Effect.flatMap(({ config, service }) => service.manifest(pkg, version, config.targetFor(pkg))),
						Effect.mapError(failedRead(pkg)),
						Effect.map((manifest) =>
							Option.match(manifest, {
								onNone: () => ({}),
								onSome: (m) => ({ ...(m.peerDependencies ?? {}) }),
							}),
						),
					),
				pnpmReleaseAge: () =>
					pnpmSettings.pipe(
						Effect.map(pnpmGateOf),
						Effect.mapError((e) => new ResolveError({ pkg: "pnpm-workspace.yaml", message: e.message })),
					),
			};
		}),
	);
}
