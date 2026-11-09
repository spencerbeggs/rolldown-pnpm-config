import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { RegistryResolver } from "../../src/cli/resolve.js";
import {
	WorkspaceResolverLive,
	makeWorkspaceResolver,
	readWorkspaceVersions,
} from "../../src/cli/workspace-resolve.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/workspace-next/", import.meta.url));
const GLOB_FIXTURE = fileURLToPath(new URL("./fixtures/workspace-globs/", import.meta.url));
const BUMPS_FIXTURE = fileURLToPath(new URL("./fixtures/workspace-bumps/", import.meta.url));
const BAD_CHANGESET_FIXTURE = fileURLToPath(new URL("./fixtures/workspace-bad-changeset/", import.meta.url));

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

	it.effect("contributes no pnpm release-age gate", () =>
		Effect.gen(function* () {
			const value = yield* use((r) => r.pnpmReleaseAge());
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

describe("pending changeset bumps", () => {
	it("applies the strongest bump per package across changesets, in either file order", () => {
		const map = readWorkspaceVersions(BUMPS_FIXTURE);
		// alpha: patch (one.md) then major (two.md) → major; beta: minor (one.md) then
		// patch (three.md) → minor — a weaker later bump never downgrades a stronger one.
		expect(map.get("@bump/alpha")).toBe("2.0.0");
		expect(map.get("@bump/beta")).toBe("1.1.0");
	});

	it("treats a none release as no bump, and skips the README", () => {
		// gamma: `none` in two.md, `major` only in README.md — which is not a changeset.
		expect(readWorkspaceVersions(BUMPS_FIXTURE).get("@bump/gamma")).toBe("1.0.0");
	});

	it("never introduces an entry for a package outside the workspace", () => {
		expect(readWorkspaceVersions(BUMPS_FIXTURE).has("@bump/outside")).toBe(false);
	});

	it.effect("reports a skipped changeset only once a read has happened", () =>
		Effect.gen(function* () {
			const resolver = makeWorkspaceResolver(BAD_CHANGESET_FIXTURE);
			expect(resolver.skippedChangesets()).toEqual([]);
			yield* resolver.versions("@bump/alpha");
			const skipped = resolver.skippedChangesets();
			expect(skipped.map((s) => s.file)).toEqual([".changeset/bad.md"]);
			expect(skipped[0]?.message).not.toBe("");
		}),
	);

	it("drops only a malformed changeset's bumps and keeps the valid ones", () => {
		expect(readWorkspaceVersions(BAD_CHANGESET_FIXTURE)).toEqual(
			new Map([
				["@bump/alpha", "1.1.0"],
				["@bump/beta", "1.0.0"],
				["@bump/gamma", "1.0.0"],
			]),
		);
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
