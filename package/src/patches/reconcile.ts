import { basename, join } from "node:path";
import { patchKeyFromFileName } from "./keys.js";

/** Informational reconcile of registered patches against on-disk reality. @internal */
export interface PatchReconcileReport {
	readonly staleEntries: readonly string[];
	readonly keyMismatches: readonly string[];
}

/**
 * Report `patchedDependencies` entries whose file is missing (`staleEntries`) or
 * whose key does not derive from its filename (`keyMismatches`). `exists` is
 * injected so the function stays pure and testable.
 *
 * @internal
 */
export function reconcilePatches(args: {
	parsedPatched: Record<string, string>;
	root: string;
	exists: (absPath: string) => boolean;
}): PatchReconcileReport {
	const staleEntries: string[] = [];
	const keyMismatches: string[] = [];
	for (const [key, rel] of Object.entries(args.parsedPatched)) {
		if (!args.exists(join(args.root, rel))) staleEntries.push(key);
		const derived = patchKeyFromFileName(basename(rel));
		if (derived !== null && derived !== key) keyMismatches.push(key);
	}
	return { staleEntries, keyMismatches };
}
