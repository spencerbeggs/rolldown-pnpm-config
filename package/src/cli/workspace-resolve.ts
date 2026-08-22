import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SemVer } from "@effected/semver";
import { Effect, Layer } from "effect";
import { RegistryResolver, ResolveError } from "./resolve.js";

/** The subset of a workspace package manifest the resolver reads. */
interface Manifest {
	readonly name: string;
	readonly version: string;
	readonly peerDependencies?: Record<string, string>;
	readonly publishConfig?: { readonly access?: string };
}

/** A changeset bump level, ordered weakest to strongest. */
type Bump = "patch" | "minor" | "major";

const BUMP_ORDER: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };

/** Matches one changeset frontmatter line: `"@scope/name": minor` (quotes optional). */
const FRONTMATTER_LINE_RE = /^\s*["']?([^"':\s]+)["']?\s*:\s*(major|minor|patch)\s*$/;

/**
 * Read every publishable workspace package manifest under `<rootDir>/packages`.
 *
 * Publishability is `publishConfig.access === "public"`, NOT `private === false`:
 * source manifests in the target repos are uniformly `private: true` and are
 * flipped at build time, so filtering on `private` yields an empty map.
 * Unreadable or malformed manifests are skipped rather than failing.
 *
 * @internal
 */
export function readManifests(rootDir: string): Map<string, Manifest> {
	const out = new Map<string, Manifest>();
	const pkgsDir = join(rootDir, "packages");
	if (!existsSync(pkgsDir)) return out;
	for (const entry of readdirSync(pkgsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const manifestPath = join(pkgsDir, entry.name, "package.json");
		if (!existsSync(manifestPath)) continue;
		let manifest: Manifest;
		try {
			manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
		} catch {
			continue;
		}
		if (typeof manifest.name !== "string" || typeof manifest.version !== "string") continue;
		if (manifest.publishConfig?.access !== "public") continue;
		out.set(manifest.name, manifest);
	}
	return out;
}

/**
 * Read the pending changeset bumps from `<rootDir>/.changeset/*.md` (skipping
 * README.md): each file's YAML frontmatter (between the first two `---` lines)
 * maps package name → bump level; the strongest bump per package wins.
 * An absent or unreadable `.changeset/` yields an empty map.
 */
function readPendingBumps(rootDir: string): Map<string, Bump> {
	const out = new Map<string, Bump>();
	const dir = join(rootDir, ".changeset");
	if (!existsSync(dir)) return out;
	let names: string[];
	try {
		names = readdirSync(dir).filter((n) => n.endsWith(".md") && n !== "README.md");
	} catch {
		return out;
	}
	for (const name of names) {
		let text: string;
		try {
			text = readFileSync(join(dir, name), "utf8");
		} catch {
			continue;
		}
		const lines = text.split("\n");
		const fences: number[] = [];
		for (let i = 0; i < lines.length && fences.length < 2; i++) {
			if (lines[i]?.trim() === "---") fences.push(i);
		}
		const [open, close] = fences;
		if (open === undefined || close === undefined) continue;
		for (const line of lines.slice(open + 1, close)) {
			const m = FRONTMATTER_LINE_RE.exec(line);
			if (!m) continue;
			const [, pkg, bump] = m as unknown as [string, string, Bump];
			const prev = out.get(pkg);
			if (prev === undefined || BUMP_ORDER[bump] > BUMP_ORDER[prev]) out.set(pkg, bump);
		}
	}
	return out;
}

/** Apply the strongest pending bump for each package already present in `versions`. */
function applyPendingBumps(rootDir: string, versions: Map<string, string>): void {
	const bumps = readPendingBumps(rootDir);
	for (const [pkg, bump] of bumps) {
		const current = versions.get(pkg);
		// A changeset naming a non-publishable package must not introduce an entry.
		if (current === undefined) continue;
		let parsed: SemVer;
		try {
			parsed = Effect.runSync(SemVer.parse(current));
		} catch {
			continue;
		}
		versions.set(pkg, parsed.bump[bump]().toString());
	}
}

/**
 * Read every publishable workspace package's NEXT release version: the current
 * manifest version overlaid with the bump implied by any pending changeset.
 * Absent or unreadable `.changeset/` degrades to current versions.
 *
 * @internal
 */
export function readWorkspaceVersions(rootDir: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const [name, manifest] of readManifests(rootDir)) {
		out.set(name, manifest.version);
	}
	applyPendingBumps(rootDir, out);
	return out;
}

/**
 * A RegistryResolver layer backed by the local workspace instead of the npm
 * registry: `versions` yields a single-element list holding the package's next
 * release version, `times` is empty (an unpublished version has no publish
 * date — the release-age gate must exempt workspace-sourced entries),
 * `peerDependencies` reads the local manifest, and `pnpmConfig` is null.
 *
 * `Layer.sync`, not `Layer.effect`: the reads are synchronous and the layer
 * has no service dependencies (unlike `RegistryResolverLive`, which spawns).
 *
 * @internal
 */
export function WorkspaceResolverLive(rootDir: string): Layer.Layer<RegistryResolver> {
	return Layer.sync(RegistryResolver, () => {
		const manifests = readManifests(rootDir);
		const versions = readWorkspaceVersions(rootDir);
		return {
			versions: (pkg: string) => {
				const v = versions.get(pkg);
				return v === undefined
					? Effect.fail(new ResolveError({ pkg, message: `${pkg} is not a publishable workspace package` }))
					: Effect.succeed([v]);
			},
			times: () => Effect.succeed({}),
			peerDependencies: (pkg: string) => Effect.succeed(manifests.get(pkg)?.peerDependencies ?? {}),
			pnpmConfig: () => Effect.succeed<string | null>(null),
		};
	});
}
