import { Effect } from "effect";

export interface StubSpec {
	readonly versions?: Record<string, string[]>;
	readonly times?: Record<string, Record<string, string>>;
	readonly peerDependencies?: Record<string, Record<string, Record<string, string>>>; // pkg -> version -> peerDeps
	readonly pnpmConfig?: Record<string, string | null>;
}

/** Build a RegistryResolver-shaped stub for integration tests. */
export function makeStubResolver(spec: StubSpec) {
	return {
		versions: (pkg: string) => Effect.succeed(spec.versions?.[pkg] ?? []),
		times: (pkg: string) => Effect.succeed(spec.times?.[pkg] ?? {}),
		peerDependencies: (pkg: string, version: string) => Effect.succeed(spec.peerDependencies?.[pkg]?.[version] ?? {}),
		pnpmConfig: (key: string) => Effect.succeed(spec.pnpmConfig?.[key] ?? null),
	};
}
