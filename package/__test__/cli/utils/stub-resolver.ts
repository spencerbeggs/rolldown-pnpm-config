import { Effect, Layer } from "effect";
import { RegistryResolver, ResolveError } from "../../../src/cli/resolve.js";

export interface StubSpec {
	readonly versions?: Record<string, string[]>;
	readonly times?: Record<string, Record<string, string>>;
	readonly peerDependencies?: Record<string, Record<string, Record<string, string>>>; // pkg -> version -> peerDeps
	readonly pnpmConfig?: Record<string, string | null>;
	/** Packages whose versions fetch FAILS outright (registry error / no such package). */
	readonly failVersions?: readonly string[];
}

/** Build a RegistryResolver-shaped stub for integration tests. */
export function makeStubResolver(spec: StubSpec) {
	return {
		versions: (pkg: string) =>
			spec.failVersions?.includes(pkg)
				? Effect.fail(new Error(`404 Not Found - GET https://registry.npmjs.org/${pkg}`))
				: Effect.succeed(spec.versions?.[pkg] ?? []),
		times: (pkg: string) => Effect.succeed(spec.times?.[pkg] ?? {}),
		peerDependencies: (pkg: string, version: string) => Effect.succeed(spec.peerDependencies?.[pkg]?.[version] ?? {}),
		pnpmConfig: (key: string) => Effect.succeed(spec.pnpmConfig?.[key] ?? null),
	};
}

/**
 * {@link makeStubResolver} as a `RegistryResolver` layer, for driving a whole
 * command: a failing fetch is the resolver's own typed `ResolveError`.
 */
export function stubResolverLayer(spec: StubSpec): Layer.Layer<RegistryResolver> {
	const stub = makeStubResolver(spec);
	return Layer.succeed(RegistryResolver, {
		...stub,
		versions: (pkg) =>
			spec.failVersions?.includes(pkg)
				? Effect.fail(new ResolveError({ pkg, message: `404 Not Found - GET https://registry.npmjs.org/${pkg}` }))
				: Effect.succeed(spec.versions?.[pkg] ?? []),
	});
}
