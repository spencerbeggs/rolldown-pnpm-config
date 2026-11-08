import { Fmt } from "@effected/cli-kit";
import type { PartialReleaseAgeGate } from "@effected/npm";
import { PnpmSettings } from "@effected/workspaces";
import { Context, Data, Effect, FileSystem, Layer, Option, Path, Predicate } from "effect";
// The process index re-exports its modules as namespaces, so the
// ChildProcessSpawner service class lives at ChildProcessSpawner.ChildProcessSpawner
// (deep subpath imports are not in the package's exports map).
import { ChildProcess, ChildProcessSpawner } from "effect/process";

type Spawner = ChildProcessSpawner.ChildProcessSpawner;
const Spawner = ChildProcessSpawner.ChildProcessSpawner;

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
 * release-age gate pnpm itself would apply. The Live implementation shells out
 * to `pnpm view` for registry reads, reusing the user's .npmrc, scoped
 * registries, auth tokens, proxy and TLS settings, and reads pnpm's own
 * settings through `@effected/workspaces`' `PnpmSettings`.
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
	/** Where the run was invoked — the directory pnpm reads its settings from. */
	readonly cwd: string;
	/** The environment (`process.env`): `pnpm_config_*`, `HOME`. */
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
 * Drop pnpm's own notice lines from captured stdout. pnpm prints e.g.
 * `[WARN] This project is configured to use 12.5.0… Your current pnpm is v12.4.2`
 * (a `packageManager` mismatch) to STDOUT ahead of the `--json` payload, which
 * would otherwise make every `pnpm view` unparseable and report each real
 * package as an unresolvable typo.
 *
 * @internal
 */
export function stripPnpmNotices(stdout: string): string {
	return stdout.replace(/^[ \t]*(?:\[WARN\]|\[ERR\]|WARN\b|ERR_PNPM_\w+)[^\n]*\n?/gm, "");
}

/** Parse `pnpm view ... versions --json` stdout: a JSON array, or a single JSON string. @internal */
export function parseVersions(pkg: string, stdout: string): Effect.Effect<string[], ResolveError> {
	return Effect.try({
		try: () => {
			const json = JSON.parse(stdout) as unknown;
			if (Array.isArray(json)) return json.map(String);
			if (typeof json === "string") return [json];
			throw new Error("unexpected shape");
		},
		catch: () => new ResolveError({ pkg, message: `Could not parse versions for ${pkg}` }),
	});
}

/** Parse a `pnpm view ... --json` object of string values into a string record. */
function parseStringRecord(
	pkg: string,
	stdout: string,
	what: string,
): Effect.Effect<Record<string, string>, ResolveError> {
	return Effect.try({
		try: () => {
			const json = JSON.parse(stdout) as unknown;
			if (!Predicate.isObject(json)) throw new Error("unexpected shape");
			const out: Record<string, string> = {};
			for (const [k, v] of Object.entries(json)) out[k] = String(v);
			return out;
		},
		catch: () => new ResolveError({ pkg, message: `Could not parse ${what} for ${pkg}` }),
	});
}

/** Parse `pnpm view <pkg> time --json` stdout: an object of version → ISO date. @internal */
export function parseTimes(pkg: string, stdout: string): Effect.Effect<Record<string, string>, ResolveError> {
	return parseStringRecord(pkg, stdout, "times");
}

/** Parse `pnpm view <pkg>@<version> peerDependencies --json`; empty stdout → {}. @internal */
export function parsePeerDeps(pkg: string, stdout: string): Effect.Effect<Record<string, string>, ResolveError> {
	const trimmed = stdout.trim();
	if (trimmed === "") return Effect.succeed({});
	return parseStringRecord(pkg, trimmed, "peerDependencies");
}

/**
 * Live RegistryResolver: registry reads through `pnpm view`, the release-age
 * gate through `PnpmSettings`.
 *
 * Registry reads stay on `pnpm view` rather than `@effected/npm`'s
 * `NpmRegistry` until the kit honours npmrc `proxy`/`https-proxy`,
 * `cafile`/`ca` and `strict-ssl` (spencerbeggs/effected#1307, tracked locally
 * in #295): over plain `fetch`, a user behind a corporate proxy or an
 * internal CA would fail every lookup that `pnpm view` answers.
 *
 * `PnpmSettings` loads lazily and once (`Effect.cached`), so a malformed
 * `pnpm-workspace.yaml` fails only `pnpmReleaseAge`, typed, and never layer
 * construction.
 *
 * @internal
 */
export function RegistryResolverLive(
	options: RegistryResolverOptions,
): Layer.Layer<RegistryResolver, never, Spawner | FileSystem.FileSystem | Path.Path> {
	return Layer.effect(
		RegistryResolver,
		Effect.gen(function* () {
			const spawner = yield* Spawner;
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const pnpmSettings = yield* Effect.cached(
				PnpmSettings.load({ cwd: options.cwd, env: options.env, platform: options.platform }).pipe(
					Effect.provideService(FileSystem.FileSystem, fs),
					Effect.provideService(Path.Path, path),
				),
			);
			/** `pnpm view <spec> <field> --json` stdout, with a spawn failure typed against `pkg`. */
			const pnpmView = (pkg: string, spec: string, field: string): Effect.Effect<string, ResolveError> =>
				spawner.string(ChildProcess.make("pnpm", ["view", spec, field, "--json"])).pipe(
					Effect.map(stripPnpmNotices),
					Effect.mapError((e) => new ResolveError({ pkg, message: Fmt.errorText(e) })),
				);
			return {
				versions: (pkg: string) =>
					pnpmView(pkg, pkg, "versions").pipe(Effect.flatMap((out) => parseVersions(pkg, out))),
				times: (pkg: string) => pnpmView(pkg, pkg, "time").pipe(Effect.flatMap((out) => parseTimes(pkg, out))),
				peerDependencies: (pkg: string, version: string) =>
					pnpmView(pkg, `${pkg}@${version}`, "peerDependencies").pipe(Effect.flatMap((out) => parsePeerDeps(pkg, out))),
				pnpmReleaseAge: () =>
					pnpmSettings.pipe(
						Effect.map(pnpmGateOf),
						Effect.mapError((e) => new ResolveError({ pkg: "pnpm-workspace.yaml", message: Fmt.errorText(e) })),
					),
			};
		}),
	);
}
