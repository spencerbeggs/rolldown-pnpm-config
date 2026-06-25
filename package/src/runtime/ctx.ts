import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PnpmConfig, RuntimeCtx } from "./types.js";

/**
 * Resolve the consuming repo's root package name. Prefers pnpm's
 * `rootProjectManifest.name`, falling back to reading `package.json` from the
 * workspace/lockfile dir. Ports Silk `resolveRootName`.
 *
 * @internal
 */
export function resolveRootName(config: PnpmConfig): string | undefined {
	const c = config as PnpmConfig & {
		rootProjectManifest?: { name?: string };
		rootProjectManifestDir?: string;
		lockfileDir?: string;
		workspaceDir?: string;
		dir?: string;
	};
	if (c.rootProjectManifest?.name) return c.rootProjectManifest.name;
	const rootDir = c.rootProjectManifestDir ?? c.lockfileDir ?? c.workspaceDir ?? c.dir ?? process.cwd();
	try {
		const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as { name?: string };
		return pkg.name;
	} catch {
		return undefined;
	}
}

/**
 * Drop packages assigned to the consuming repo from a merged hoist list.
 * Data-driven port of Silk's `WORKSPACE_LOCAL_HOISTS_BY_REPO` exclusion.
 *
 * @internal
 */
export function excludeByRepo(merged: string[], ctx: RuntimeCtx, byRepo: Record<string, string[]>): string[] {
	const exclude = ctx.rootName ? byRepo[ctx.rootName] : undefined;
	if (!exclude || exclude.length === 0) return merged;
	const set = new Set(exclude);
	return merged.filter((p) => !set.has(p));
}
