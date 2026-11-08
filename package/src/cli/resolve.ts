import { Fmt } from "@effected/cli-kit";
import type { PartialReleaseAgeGate, RegistryTarget } from "@effected/npm";
import { NpmConfig, NpmRegistry } from "@effected/npm";
import { PnpmSettings } from "@effected/workspaces";
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
 * registry over HTTP through `@effected/npm`'s `NpmRegistry`, routed and
 * authenticated by the npmrc `NpmConfig` resolves, and reads pnpm's own
 * settings through `@effected/workspaces`' `PnpmSettings` — no subprocess.
 *
 * @internal
 */
export class RegistryResolver extends Context.Service<
	RegistryResolver,
	{
		readonly versions: (pkg: string) => Effect.Effect<string[], ResolveError>;
		readonly times: (pkg: string) => Effect.Effect<Record<string, string>, ResolveError>;
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
	/** Where the run was invoked — the directory pnpm and npm would read config from. */
	readonly cwd: string;
	/** The environment (`process.env`): `npm_config_*`, `pnpm_config_*`, `${VAR}`, `HOME`. */
	readonly env: Readonly<Record<string, string | undefined>>;
	/** The platform (`process.platform`), for pnpm's global config directory. */
	readonly platform: string;
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

/**
 * Live RegistryResolver over `NpmRegistry` + `NpmConfig` (registry reads) and
 * `PnpmSettings` (the release-age gate).
 *
 * The npmrc is loaded at the WORKSPACE ROOT (`workspaceRoot: true`), as pnpm
 * reads it, so a scoped registry or token configured once at the root applies
 * from any nested package. Both config loads are memoized for the layer's
 * lifetime and resolved lazily, so a command that never reads the registry
 * never reads an npmrc — and a broken npmrc fails only the reads that need it,
 * as a typed `ResolveError`, rather than the whole CLI at layer construction.
 *
 * A package the registry does not know (a 404, which `NpmRegistry` answers as
 * an empty version list) fails `versions` with `ResolveError`, the same path a
 * failing `pnpm view` took. An unknown version's peers read as `{}`.
 *
 * A layer-returning function: call it once at the edge and bind the result,
 * or the layer (and its memoized loads) builds twice.
 *
 * @internal
 */
export function RegistryResolverLive(
	options: RegistryResolverOptions,
): Layer.Layer<RegistryResolver, never, NpmRegistry | FileSystem.FileSystem | Path.Path> {
	return Layer.effect(
		RegistryResolver,
		Effect.gen(function* () {
			const registry = yield* NpmRegistry;
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const withPlatform = <A, E>(
				effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
			): Effect.Effect<A, E> =>
				effect.pipe(Effect.provideService(FileSystem.FileSystem, fs), Effect.provideService(Path.Path, path));
			const npmConfig = yield* Effect.cached(
				withPlatform(NpmConfig.load({ cwd: options.cwd, env: options.env, workspaceRoot: true })),
			);
			const pnpmSettings = yield* Effect.cached(
				withPlatform(PnpmSettings.load({ cwd: options.cwd, env: options.env, platform: options.platform })),
			);
			/** Run a registry read for `pkg` with its npmrc target, any failure typed against `pkg`. */
			const read = <A, E>(
				pkg: string,
				f: (target: RegistryTarget) => Effect.Effect<A, E>,
			): Effect.Effect<A, ResolveError> =>
				npmConfig.pipe(
					Effect.flatMap((config) => f(config.targetFor(pkg))),
					Effect.mapError((e) => new ResolveError({ pkg, message: Fmt.errorText(e) })),
				);
			return {
				versions: (pkg: string) =>
					read(pkg, (target) => registry.versions(pkg, target)).pipe(
						Effect.flatMap((versions) =>
							versions.length === 0
								? Effect.fail(new ResolveError({ pkg, message: `${pkg} was not found on the registry` }))
								: Effect.succeed([...versions]),
						),
					),
				times: (pkg: string) =>
					read(pkg, (target) => registry.publishTimes(pkg, target)).pipe(
						Effect.map((times) => {
							const out: Record<string, string> = {};
							for (const t of times) out[t.version] = DateTime.formatIso(t.publishedAt);
							return out;
						}),
					),
				peerDependencies: (pkg: string, version: string) =>
					read(pkg, (target) => registry.manifest(pkg, version, target)).pipe(
						Effect.map((manifest) =>
							Option.match(manifest, {
								onNone: () => ({}),
								onSome: (m) => ({ ...m.peerDependencies }),
							}),
						),
					),
				pnpmReleaseAge: () =>
					pnpmSettings.pipe(
						Effect.map(pnpmGateOf),
						Effect.mapError((e) => new ResolveError({ pkg: "pnpm-workspace.yaml", message: Fmt.errorText(e) })),
					),
			};
		}),
	);
}
