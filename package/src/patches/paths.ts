import { basename, join, posix, relative } from "node:path";

/**
 * Consumer-resolved distributed patch path for a config dependency:
 * `node_modules/.pnpm-config/<name>/<rel>`, POSIX separators. `<name>` is used
 * verbatim (a scoped name keeps its `/`). Verify the prefix against a real
 * install — see plan Task 1.
 *
 * @internal
 */
export function distributedPatchPath(name: string, rel: string): string {
	const segments = rel.split(/[\\/]/).filter(Boolean);
	return posix.join("node_modules", ".pnpm-config", name, ...segments);
}

/**
 * The patch's path relative to the bundler's `public/` directory — the subpath
 * the bundler preserves when copying `public/` into `dist/`. Falls back to
 * `<basename(distRoot)>/<fileName>` when `distRoot` is not under `public/`.
 *
 * @internal
 */
export function distributedRel(baseDir: string, distRoot: string, fileName: string): string {
	const publicDir = join(baseDir, "public");
	const rel = relative(publicDir, distRoot);
	const sub = rel === "" || rel.startsWith("..") ? basename(distRoot) : rel;
	return `${sub.split(/[\\/]/).filter(Boolean).join("/")}/${fileName}`;
}
