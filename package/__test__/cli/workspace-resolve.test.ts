import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { RegistryResolver } from "../../src/cli/resolve.js";
import { WorkspaceResolverLive, readWorkspaceVersions } from "../../src/cli/workspace-resolve.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/workspace-next/", import.meta.url));
const GLOB_FIXTURE = fileURLToPath(new URL("./fixtures/workspace-globs/", import.meta.url));

const useAt = <A, E>(root: string, f: (r: (typeof RegistryResolver)["Service"]) => Effect.Effect<A, E>): Promise<A> =>
	Effect.runPromise(
		Effect.gen(function* () {
			const r = yield* RegistryResolver;
			return yield* f(r);
		}).pipe(Effect.provide(WorkspaceResolverLive(root))),
	);

const use = <A, E>(f: (r: (typeof RegistryResolver)["Service"]) => Effect.Effect<A, E>): Promise<A> =>
	useAt(FIXTURE, f);

describe("WorkspaceResolverLive", () => {
	it("returns the next version for a package with a pending changeset", async () => {
		const versions = await use((r) => r.versions("@fix/bumped"));
		expect(versions).toEqual(["0.3.0"]);
	});

	it("returns the current version for a package with no changeset", async () => {
		const versions = await use((r) => r.versions("@fix/untouched"));
		expect(versions).toEqual(["0.1.0"]);
	});

	it("fails with ResolveError for a package that is not publishable", async () => {
		const err = await use((r) => r.versions("@fix/internal").pipe(Effect.flip));
		expect(err._tag).toBe("ResolveError");
	});

	it("reports no publish times", async () => {
		const times = await use((r) => r.times("@fix/bumped"));
		expect(times).toEqual({});
	});

	it("returns the local manifest's peerDependencies", async () => {
		const peers = await use((r) => r.peerDependencies("@fix/bumped", "0.3.0"));
		expect(peers).toEqual({ "@fix/untouched": "^0.1.0" });
	});

	it("returns null for any pnpm config key", async () => {
		const value = await use((r) => r.pnpmConfig("minimumReleaseAge"));
		expect(value).toBeNull();
	});
});

describe("readWorkspaceVersions", () => {
	it("overlays pending changeset bumps and filters on publishConfig.access", () => {
		const map = readWorkspaceVersions(FIXTURE);
		expect(map).toEqual(
			new Map([
				["@fix/bumped", "0.3.0"],
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

	it("resolves a glob-enumerated package through the resolver layer", async () => {
		const versions = await useAt(GLOB_FIXTURE, (r) => r.versions("@glob/cli"));
		expect(versions).toEqual(["2.0.0"]);
	});

	it("reads peerDependencies from a glob-enumerated manifest", async () => {
		const peers = await useAt(GLOB_FIXTURE, (r) => r.peerDependencies("@glob/lib-a", "1.1.0"));
		expect(peers).toEqual({ "@glob/lib-b": "^0.5.0" });
	});

	it("fails with ResolveError for a package outside the declared globs", async () => {
		const err = await useAt(GLOB_FIXTURE, (r) => r.versions("@glob/legacy").pipe(Effect.flip));
		expect(err._tag).toBe("ResolveError");
	});
});
