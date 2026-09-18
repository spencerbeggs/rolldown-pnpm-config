import { Context, Data, Effect, Layer, Predicate } from "effect";
// The unstable/process index re-exports its modules as namespaces, so the
// ChildProcessSpawner service class lives at ChildProcessSpawner.ChildProcessSpawner
// (deep subpath imports are not in the package's exports map).
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

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
 * Resolves the published versions of a package from the registry. The Live
 * implementation shells out to `pnpm view`, reusing the user's .npmrc, scoped
 * registries, and auth tokens.
 *
 * @internal
 */
export class RegistryResolver extends Context.Service<
	RegistryResolver,
	{
		readonly versions: (pkg: string) => Effect.Effect<string[], ResolveError>;
		readonly times: (pkg: string) => Effect.Effect<Record<string, string>, ResolveError>;
		readonly peerDependencies: (pkg: string, version: string) => Effect.Effect<Record<string, string>, ResolveError>;
		readonly pnpmConfig: (key: string) => Effect.Effect<string | null, ResolveError>;
	}
>()("RegistryResolver") {}

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

/** Parse `pnpm view ... versions --json` stdout: a JSON array, or a single JSON string. */
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
 * Live RegistryResolver backed by `pnpm view <pkg> versions --json`.
 *
 * @internal
 */
export const RegistryResolverLive: Layer.Layer<RegistryResolver, never, Spawner> = Layer.effect(
	RegistryResolver,
	Effect.gen(function* () {
		const spawner = yield* Spawner;
		/** `pnpm view <spec> <field> --json` stdout, with a spawn failure typed against `pkg`. */
		const pnpmView = (pkg: string, spec: string, field: string): Effect.Effect<string, ResolveError> =>
			spawner.string(ChildProcess.make("pnpm", ["view", spec, field, "--json"])).pipe(
				Effect.map(stripPnpmNotices),
				Effect.mapError((e) => new ResolveError({ pkg, message: String(e) })),
			);
		return {
			versions: (pkg: string) => pnpmView(pkg, pkg, "versions").pipe(Effect.flatMap((out) => parseVersions(pkg, out))),
			times: (pkg: string) => pnpmView(pkg, pkg, "time").pipe(Effect.flatMap((out) => parseTimes(pkg, out))),
			peerDependencies: (pkg: string, version: string) =>
				pnpmView(pkg, `${pkg}@${version}`, "peerDependencies").pipe(Effect.flatMap((out) => parsePeerDeps(pkg, out))),
			pnpmConfig: (key: string) =>
				Effect.gen(function* () {
					const cmd = ChildProcess.make("pnpm", ["config", "get", key]);
					return yield* spawner.string(cmd).pipe(
						Effect.map((s) => stripPnpmNotices(s).trim()),
						Effect.orElseSucceed(() => null as string | null),
					);
				}),
		};
	}),
);
