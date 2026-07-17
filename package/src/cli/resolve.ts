import { Context, Data, Effect, Layer } from "effect";
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

/** Parse `pnpm view <pkg> time --json` stdout: an object of version → ISO date. @internal */
export function parseTimes(pkg: string, stdout: string): Effect.Effect<Record<string, string>, ResolveError> {
	return Effect.try({
		try: () => {
			const json = JSON.parse(stdout) as unknown;
			if (json && typeof json === "object" && !Array.isArray(json)) {
				const out: Record<string, string> = {};
				for (const [k, v] of Object.entries(json as Record<string, unknown>)) out[k] = String(v);
				return out;
			}
			throw new Error("unexpected shape");
		},
		catch: () => new ResolveError({ pkg, message: `Could not parse times for ${pkg}` }),
	});
}

/** Parse `pnpm view <pkg>@<version> peerDependencies --json`; empty stdout → {}. @internal */
export function parsePeerDeps(pkg: string, stdout: string): Effect.Effect<Record<string, string>, ResolveError> {
	const trimmed = stdout.trim();
	if (trimmed === "") return Effect.succeed({});
	return Effect.try({
		try: () => {
			const json = JSON.parse(trimmed) as unknown;
			if (json && typeof json === "object" && !Array.isArray(json)) {
				const out: Record<string, string> = {};
				for (const [k, v] of Object.entries(json as Record<string, unknown>)) out[k] = String(v);
				return out;
			}
			throw new Error("unexpected shape");
		},
		catch: () => new ResolveError({ pkg, message: `Could not parse peerDependencies for ${pkg}` }),
	});
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
		return {
			versions: (pkg: string) =>
				Effect.gen(function* () {
					const cmd = ChildProcess.make("pnpm", ["view", pkg, "versions", "--json"]);
					const stdout = yield* spawner
						.string(cmd)
						.pipe(Effect.mapError((e) => new ResolveError({ pkg, message: String(e) })));
					return yield* parseVersions(pkg, stdout);
				}),
			times: (pkg: string) =>
				Effect.gen(function* () {
					const cmd = ChildProcess.make("pnpm", ["view", pkg, "time", "--json"]);
					const stdout = yield* spawner
						.string(cmd)
						.pipe(Effect.mapError((e) => new ResolveError({ pkg, message: String(e) })));
					return yield* parseTimes(pkg, stdout);
				}),
			peerDependencies: (pkg: string, version: string) =>
				Effect.gen(function* () {
					const cmd = ChildProcess.make("pnpm", ["view", `${pkg}@${version}`, "peerDependencies", "--json"]);
					const stdout = yield* spawner
						.string(cmd)
						.pipe(Effect.mapError((e) => new ResolveError({ pkg, message: String(e) })));
					return yield* parsePeerDeps(pkg, stdout);
				}),
			pnpmConfig: (key: string) =>
				Effect.gen(function* () {
					const cmd = ChildProcess.make("pnpm", ["config", "get", key]);
					return yield* spawner.string(cmd).pipe(
						Effect.map((s) => s.trim()),
						Effect.catch(() => Effect.succeed<string | null>(null)),
					);
				}),
		};
	}),
);
