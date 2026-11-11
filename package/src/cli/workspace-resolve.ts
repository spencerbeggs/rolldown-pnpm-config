import { resolve } from "node:path";
import type { BumpType } from "@effected/changesets";
import { PendingChangesets } from "@effected/changesets";
import { Fmt } from "@effected/cli-kit";
import {
	WorkspaceDiscoveryError,
	WorkspacePatternError,
	findWorkspaceRootSync,
	getWorkspacePackagesSync,
} from "@effected/workspaces";
import { nodeSyncOps } from "@effected/workspaces/node-sync";
import { Effect, Layer, Result } from "effect";
import { parseVersion } from "../semver-util.js";
import { RegistryResolver, ResolveError } from "./resolve.js";

/** The RegistryResolver service shape, shared by the registry and workspace implementations. */
type ResolverShape = (typeof RegistryResolver)["Service"];

/** The subset of a workspace package manifest the resolver reads. */
interface Manifest {
	readonly name: string;
	readonly version: string;
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

/**
 * A pending changeset file the workspace resolver could not read or parse, so
 * its bumps were dropped: `file` is relative to the workspace root (for
 * example `.changeset/bad.md`), `message` is why.
 *
 * @internal
 */
export interface SkippedChangeset {
	readonly file: string;
	readonly message: string;
}

/**
 * The workspace resolver, plus the changesets its reads skipped. Reads are
 * lazy, so `skippedChangesets` answers empty until a workspace-sourced entry
 * has actually resolved: a skipped file that changed no answer is not reported.
 *
 * @internal
 */
export type WorkspaceResolver = ResolverShape & {
	readonly skippedChangesets: () => ReadonlyArray<SkippedChangeset>;
};

/** Bump strength, weakest to strongest, for strongest-bump-per-package. */
const BUMP_ORDER: Record<BumpType, number> = { patch: 0, minor: 1, major: 2 };

/**
 * Read every workspace package manifest under `rootDir` with a usable name and
 * version, honoring the workspace's own `pnpm-workspace.yaml` `packages:`
 * globs (including exclusion patterns) via `@effected/workspaces` — never a
 * hardcoded `packages/` directory.
 *
 * There is deliberately NO publishability filter: the resolver's job is
 * finding packages and their versions, full stop. Whether and how a package
 * publishes is the author's decision, made elsewhere — and catalog membership
 * is already an explicit choice in the consuming config.
 *
 * This resolver degrades, never fails. The sync discovery facade skips an
 * unreadable or malformed member manifest, but since `@effected/workspaces`
 * 0.46 it throws a `WorkspaceDiscoveryError` or `WorkspacePatternError` when
 * the pattern source itself (`pnpm-workspace.yaml` or the root `package.json`)
 * cannot be read, parsed or compiled. Those two are caught here and read as a
 * workspace with no packages, as before; any other throw propagates.
 *
 * Since `@effected/workspaces` 0.19, that enumeration yields the **root
 * package first** and carries a member whose manifest declares no `version`
 * (`WorkspacePackage.version` is an optional key) rather than dropping it —
 * a private, version-less monorepo root being the ordinary shape. Such a
 * member is filtered out here: this resolver maps a name to a concrete
 * version, and an entry with no version has nothing to resolve to.
 *
 * @internal
 */
export function readManifests(rootDir: string): Map<string, Manifest> {
	const out = new Map<string, Manifest>();
	let packages: ReturnType<typeof getWorkspacePackagesSync>;
	try {
		packages = getWorkspacePackagesSync(rootDir, nodeSyncOps);
	} catch (error) {
		if (error instanceof WorkspaceDiscoveryError || error instanceof WorkspacePatternError) return out;
		throw error;
	}
	for (const pkg of packages) {
		const version = pkg.version;
		if (version === undefined) continue;
		out.set(pkg.name, {
			name: pkg.name,
			version,
			peerDependencies: pkg.peerDependencies,
		});
	}
	return out;
}

/**
 * Read the pending changeset bumps under `<rootDir>/.changeset/` through
 * `@effected/changesets`' `PendingChangesets.readSettledSync` (which skips
 * readmes, agent context files, dotfiles and non-`.md` files, and also reads
 * the `pre/` changesets a pre-release keeps): package name → strongest bump.
 * A `none` release is no bump. Total: an absent `.changeset/` lists nothing,
 * an unlistable directory degrades to no bumps (current versions), and a
 * malformed changeset drops only its own bumps and is returned in `skipped`
 * for the caller to report, never a failure.
 */
function readPendingBumps(rootDir: string): { bumps: Map<string, BumpType>; skipped: SkippedChangeset[] } {
	const bumps = new Map<string, BumpType>();
	const pending = PendingChangesets.readSettledSync(rootDir);
	if (Result.isFailure(pending)) return { bumps, skipped: [] };
	const skipped = pending.success.failures.map((f) => ({
		file: `.changeset/${f.file}`,
		message: Fmt.errorText(f.error),
	}));
	for (const changeset of pending.success.changesets) {
		for (const [pkg, release] of changeset.releases) {
			if (release === "none") continue;
			const prev = bumps.get(pkg);
			if (prev === undefined || BUMP_ORDER[release] > BUMP_ORDER[prev]) bumps.set(pkg, release);
		}
	}
	return { bumps, skipped };
}

/** Apply the strongest pending bump for each package already present in `versions`. */
function applyPendingBumps(rootDir: string, versions: Map<string, string>): SkippedChangeset[] {
	const { bumps, skipped } = readPendingBumps(rootDir);
	for (const [pkg, bump] of bumps) {
		const current = versions.get(pkg);
		// A changeset naming a package outside the workspace must not introduce an entry.
		if (current === undefined) continue;
		const parsed = parseVersion(current);
		if (parsed === null) continue;
		versions.set(pkg, parsed.bump[bump]().toString());
	}
	return skipped;
}

/**
 * Read every workspace package's NEXT release version: the current
 * manifest version overlaid with the bump implied by any pending changeset.
 * Absent or unreadable `.changeset/` degrades to current versions.
 *
 * @internal
 */
export function readWorkspaceVersions(rootDir: string, manifests = readManifests(rootDir)): Map<string, string> {
	return readWorkspaceState(rootDir, manifests).versions;
}

/**
 * {@link readWorkspaceVersions}, plus the pending changesets it skipped.
 *
 * @internal
 */
export function readWorkspaceState(
	rootDir: string,
	manifests = readManifests(rootDir),
): { versions: Map<string, string>; skipped: ReadonlyArray<SkippedChangeset> } {
	const versions = new Map<string, string>();
	for (const [name, manifest] of manifests) {
		versions.set(name, manifest.version);
	}
	const skipped = applyPendingBumps(rootDir, versions);
	return { versions, skipped };
}

/**
 * A RegistryResolver layer backed by the local workspace instead of the npm
 * registry: `versions` yields a single-element list holding the package's next
 * release version, `times` is empty (an unpublished version has no publish
 * date — the release-age gate must exempt workspace-sourced entries),
 * `peerDependencies` reads the local manifest, and `pnpmReleaseAge` is null.
 *
 * `Layer.sync`, not `Layer.effect`: the reads are synchronous and the layer
 * has no service dependencies (unlike `RegistryResolverLive`, which reads the
 * registry over HTTP).
 *
 * @internal
 */
export function WorkspaceResolverLive(rootDir: string): Layer.Layer<RegistryResolver> {
	return Layer.sync(RegistryResolver, () => makeWorkspaceResolver(rootDir));
}

/**
 * The plain (layer-less) workspace resolver value, for callers that route
 * per-entry between the registry service and the workspace instead of
 * providing one layer for the whole run. Reads lazily on first use so
 * constructing it for a config with no workspace-sourced entries costs nothing.
 *
 * @internal
 */
export function makeWorkspaceResolver(rootDir: string): WorkspaceResolver {
	let manifests: Map<string, Manifest> | undefined;
	let state: { versions: Map<string, string>; skipped: ReadonlyArray<SkippedChangeset> } | undefined;
	const load = (): { manifests: Map<string, Manifest>; versions: Map<string, string> } => {
		manifests ??= readManifests(rootDir);
		state ??= readWorkspaceState(rootDir, manifests);
		return { manifests, versions: state.versions };
	};
	return {
		skippedChangesets: () => state?.skipped ?? [],
		versions: (pkg: string) => {
			const v = load().versions.get(pkg);
			return v === undefined
				? Effect.fail(new ResolveError({ pkg, message: `${pkg} is not a workspace package` }))
				: Effect.succeed([v]);
		},
		times: () => Effect.succeed({}),
		peerDependencies: (pkg: string) => Effect.succeed(load().manifests.get(pkg)?.peerDependencies ?? {}),
		pnpmReleaseAge: () => Effect.succeed(null),
	};
}

/**
 * Walk upward from `startDir` to the nearest directory containing
 * `pnpm-workspace.yaml`, falling back to `startDir` itself. The config file an
 * upgrade run rewrites may live in a nested package (e.g.
 * `packages/<name>/savvy.build.ts`), while the workspace versions live at the
 * repo root.
 *
 * @internal
 */
export function findWorkspaceRoot(startDir: string): string {
	return findWorkspaceRootSync(startDir, { ...nodeSyncOps, markers: ["pnpm-workspace.yaml"] }) ?? resolve(startDir);
}
