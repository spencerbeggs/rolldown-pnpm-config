import { isAbsolute, join } from "node:path";
import { GlobPattern, GlobPatternOptions } from "@effected/glob";
import { descendSync } from "@effected/walker";
import { nodeWalkerSyncOps } from "@effected/walker/node-sync";
import { Result } from "effect";
import { patchKeyFromFileName } from "./keys.js";
import { distributedPatchPath, distributedRel } from "./paths.js";

/**
 * The patch files of one convention folder: top-level `.patch` FILES only
 * (a directory named `x.patch` is not a patch), no dotfiles, sorted.
 */
const PATCH_FILES = Result.getOrThrow(GlobPattern.compileResult("*.patch", GlobPatternOptions.make({ dot: false })));

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
 * Each folder is listed with `@effected/walker`'s `descendSync`: an absent
 * folder yields nothing, and an unreadable one throws its `DescendError`, as
 * the bare `readdirSync` this replaced threw its `EACCES`.
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
		const files = Result.getOrThrow(descendSync(PATCH_FILES, { cwd: dir, ...nodeWalkerSyncOps }));
		for (const fileName of files) {
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
