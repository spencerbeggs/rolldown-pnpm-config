import type { PluginConfig } from "../define-plugin.js";
import { discoverPatches } from "./discover.js";

/** True only for the `{ strategy: "rewrite" }` directive. @internal */
export function isRewriteDirective(v: unknown): boolean {
	return (
		v !== null &&
		typeof v === "object" &&
		!Array.isArray(v) &&
		Object.keys(v).length === 1 &&
		(v as { strategy?: unknown }).strategy === "rewrite"
	);
}

/** Read `local.localPatchesDir` when it is a string. @internal */
export function readLocalPatchesDir(config: PluginConfig): string | undefined {
	const local = config.local as { localPatchesDir?: unknown } | undefined;
	return typeof local?.localPatchesDir === "string" ? local.localPatchesDir : undefined;
}

/**
 * Resolve build-time `patchedDependencies`. When the field is absent or the
 * `{ strategy: "rewrite" }` directive, run discovery and inject the distributed
 * map (`name`-scoped `.pnpm-config` paths) so `freeze` sees a plain map. An
 * explicit map / wrapped value passes through untouched.
 *
 * @internal
 */
export function withResolvedBuildPatches(config: PluginConfig, baseDir: string): PluginConfig {
	const raw = config.patchedDependencies;
	if (raw !== undefined && !isRewriteDirective(raw)) return config;

	const localPatchesDir = readLocalPatchesDir(config);
	const distributed = discoverPatches({
		baseDir,
		name: config.name,
		...(localPatchesDir !== undefined ? { localPatchesDir } : {}),
	}).filter((p) => p.distributed);

	if (distributed.length === 0) {
		if (raw === undefined) return config;
		const { patchedDependencies: _drop, ...rest } = config;
		return rest as PluginConfig;
	}
	const map: Record<string, string> = {};
	for (const p of distributed) map[p.key] = p.distributedPath as string;
	return { ...config, patchedDependencies: map };
}
