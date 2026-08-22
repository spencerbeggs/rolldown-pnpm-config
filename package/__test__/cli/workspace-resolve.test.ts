import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { RegistryResolver } from "../../src/cli/resolve.js";
import { WorkspaceResolverLive, readWorkspaceVersions } from "../../src/cli/workspace-resolve.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/workspace-next/", import.meta.url));

const use = <A, E>(f: (r: (typeof RegistryResolver)["Service"]) => Effect.Effect<A, E>): Promise<A> =>
	Effect.runPromise(
		Effect.gen(function* () {
			const r = yield* RegistryResolver;
			return yield* f(r);
		}).pipe(Effect.provide(WorkspaceResolverLive(FIXTURE))),
	);

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
