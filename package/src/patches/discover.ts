import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { patchKeyFromFileName } from "./keys.js";
import { distributedPatchPath, distributedRel } from "./paths.js";

/** One discovered patch file, with its derived key and (when distributed) its
 *  consumer-resolved path. @internal */
export interface DiscoveredPatch {
	readonly key: string;
	readonly fileName: string;
	readonly distributed: boolean;
	readonly absPath: string;
	readonly distributedPath?: string;
}

/** @internal */
export interface DiscoverPatchesOptions {
	readonly baseDir: string;
	readonly name: string;
	readonly localPatchesDir?: string;
}

/**
 * Discover owned patches in the two convention folders adjacent to the build
 * file: `public/patches/` (distributed, rewritten) and `patches/` (local-only).
 * `localPatchesDir` overrides the distributed source root only. Read-only.
 *
 * @internal
 */
export function discoverPatches(opts: DiscoverPatchesOptions): readonly DiscoveredPatch[] {
	const distRoot = opts.localPatchesDir
		? isAbsolute(opts.localPatchesDir)
			? opts.localPatchesDir
			: join(opts.baseDir, opts.localPatchesDir)
		: join(opts.baseDir, "public", "patches");
	const localOnlyRoot = join(opts.baseDir, "patches");

	const out: DiscoveredPatch[] = [];
	collect(distRoot, true);
	collect(localOnlyRoot, false);
	return out;

	function collect(dir: string, distributed: boolean): void {
		if (!existsSync(dir)) return;
		for (const fileName of readdirSync(dir).sort()) {
			const key = patchKeyFromFileName(fileName);
			if (key === null) continue;
			const absPath = join(dir, fileName);
			out.push({
				key,
				fileName,
				distributed,
				absPath,
				...(distributed
					? { distributedPath: distributedPatchPath(opts.name, distributedRel(opts.baseDir, distRoot, fileName)) }
					: {}),
			});
		}
	}
}
