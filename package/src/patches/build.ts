import { Predicate } from "effect";
import type { PluginConfig } from "../define-plugin.js";
import type { DiscoveredPatch } from "./discover.js";
import { discoverPatches } from "./discover.js";

/** True only for the `{ strategy: "rewrite" }` directive. @internal */
export function isRewriteDirective(v: unknown): boolean {
	return Predicate.isObject(v) && Object.keys(v).length === 1 && v.strategy === "rewrite";
}

/** Read `local.localPatchesDir` when it is a string. @internal */
export function readLocalPatchesDir(config: PluginConfig): string | undefined {
	const local = config.local as { localPatchesDir?: unknown } | undefined;
	return typeof local?.localPatchesDir === "string" ? local.localPatchesDir : undefined;
}

/**
 * Discover this plugin's own patches when `patchedDependencies` is absent or
 * the `{ strategy: "rewrite" }` directive; undefined when an explicit map /
 * wrapped value is declared (the escape hatch skips discovery entirely).
 *
 * @internal
 */
export function discoverOwnedPatches(config: PluginConfig, baseDir: string): readonly DiscoveredPatch[] | undefined {
	const raw = config.patchedDependencies;
	if (raw !== undefined && !isRewriteDirective(raw)) return undefined;
	const localPatchesDir = readLocalPatchesDir(config);
	return discoverPatches({
		baseDir,
		name: config.name,
		...(localPatchesDir !== undefined ? { localPatchesDir } : {}),
	});
}

/**
 * Resolve build-time `patchedDependencies`. When the field is absent or the
 * `{ strategy: "rewrite" }` directive, run discovery and inject the distributed
 * map (`name`-scoped `.pnpm-config` paths) so `freeze` sees a plain map. An
 * explicit map / wrapped value passes through untouched. A caller that has
 * already run discovery passes its result as `owned`.
 *
 * @internal
 */
export function withResolvedBuildPatches(
	config: PluginConfig,
	baseDir: string,
	owned: readonly DiscoveredPatch[] | undefined = discoverOwnedPatches(config, baseDir),
): PluginConfig {
	const raw = config.patchedDependencies;
	if (owned === undefined) return config;

	const distributed = owned.filter((p) => p.distributed);

	if (distributed.length === 0) {
		if (raw === undefined) return config;
		const { patchedDependencies: _drop, ...rest } = config;
		return rest as PluginConfig;
	}
	const map: Record<string, string> = {};
	for (const p of distributed) map[p.key] = p.distributedPath as string;
	return { ...config, patchedDependencies: map };
}
