import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { RegistryResolver } from "../../src/cli/resolve.js";
import { WorkspaceResolverLive, readWorkspaceVersions } from "../../src/cli/workspace-resolve.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/workspace-next/", import.meta.url));
const GLOB_FIXTURE = fileURLToPath(new URL("./fixtures/workspace-globs/", import.meta.url));

const useAt = <A, E>(root: string, f: (r: (typeof RegistryResolver)["Service"]) => Effect.Effect<A, E>) =>
	Effect.gen(function* () {
		const r = yield* RegistryResolver;
		return yield* f(r);
	}).pipe(Effect.provide(WorkspaceResolverLive(root)));

const use = <A, E>(f: (r: (typeof RegistryResolver)["Service"]) => Effect.Effect<A, E>) => useAt(FIXTURE, f);

describe("WorkspaceResolverLive", () => {
	it.effect("returns the next version for a package with a pending changeset", () =>
		Effect.gen(function* () {
			const versions = yield* use((r) => r.versions("@fix/bumped"));
			expect(versions).toEqual(["0.3.0"]);
		}),
	);

	it.effect("returns the current version for a package with no changeset", () =>
		Effect.gen(function* () {
			const versions = yield* use((r) => r.versions("@fix/untouched"));
			expect(versions).toEqual(["0.1.0"]);
		}),
	);

	it.effect("resolves a package with no publishConfig — publish policy is not the resolver's concern", () =>
		Effect.gen(function* () {
			const versions = yield* use((r) => r.versions("@fix/internal"));
			expect(versions).toEqual(["0.1.0"]);
		}),
	);

	it.effect("fails with ResolveError for a name that is not in the workspace at all", () =>
		Effect.gen(function* () {
			const err = yield* use((r) => r.versions("@fix/missing").pipe(Effect.flip));
			expect(err._tag).toBe("ResolveError");
		}),
	);

	it.effect("reports no publish times", () =>
		Effect.gen(function* () {
			const times = yield* use((r) => r.times("@fix/bumped"));
			expect(times).toEqual({});
		}),
	);

	it.effect("returns the local manifest's peerDependencies", () =>
		Effect.gen(function* () {
			const peers = yield* use((r) => r.peerDependencies("@fix/bumped", "0.3.0"));
			expect(peers).toEqual({ "@fix/untouched": "^0.1.0" });
		}),
	);

	it.effect("returns null for any pnpm config key", () =>
		Effect.gen(function* () {
			const value = yield* use((r) => r.pnpmConfig("minimumReleaseAge"));
			expect(value).toBeNull();
		}),
	);
});

describe("readWorkspaceVersions", () => {
	it("overlays pending changeset bumps over every workspace member with a name and version", () => {
		const map = readWorkspaceVersions(FIXTURE);
		expect(map).toEqual(
			new Map([
				["@fix/bumped", "0.3.0"],
				["@fix/internal", "0.1.0"],
				["@fix/untouched", "0.1.0"],
			]),
		);
	});

	it("returns an empty map when the root has no packages directory", () => {
		expect(readWorkspaceVersions("/nonexistent/nowhere")).toEqual(new Map());
	});
});

describe("glob-declared workspace layouts", () => {
	it("enumerates packages from the pnpm-workspace.yaml globs, not a hardcoded packages/ directory", () => {
		const map = readWorkspaceVersions(GLOB_FIXTURE);
		expect(map).toEqual(
			new Map([
				["@glob/lib-a", "1.1.0"],
				["@glob/lib-b", "0.5.0"],
				["@glob/internal", "0.1.0"],
				["@glob/cli", "2.0.0"],
			]),
		);
	});

	it("does not enumerate a packages/ directory the workspace globs never declared", () => {
		const map = readWorkspaceVersions(GLOB_FIXTURE);
		expect(map.has("@glob/legacy")).toBe(false);
	});

	it("honors exclusion patterns in the workspace globs", () => {
		const map = readWorkspaceVersions(GLOB_FIXTURE);
		expect(map.has("@glob/excluded")).toBe(false);
	});

	it.effect("resolves a glob-enumerated package through the resolver layer", () =>
		Effect.gen(function* () {
			const versions = yield* useAt(GLOB_FIXTURE, (r) => r.versions("@glob/cli"));
			expect(versions).toEqual(["2.0.0"]);
		}),
	);

	it.effect("reads peerDependencies from a glob-enumerated manifest", () =>
		Effect.gen(function* () {
			const peers = yield* useAt(GLOB_FIXTURE, (r) => r.peerDependencies("@glob/lib-a", "1.1.0"));
			expect(peers).toEqual({ "@glob/lib-b": "^0.5.0" });
		}),
	);

	it.effect("fails with ResolveError for a package outside the declared globs", () =>
		Effect.gen(function* () {
			const err = yield* useAt(GLOB_FIXTURE, (r) => r.versions("@glob/legacy").pipe(Effect.flip));
			expect(err._tag).toBe("ResolveError");
		}),
	);
});
