/**
 * Derive the `patchedDependencies` key from a `.patch` filename, reversing pnpm's
 * `/`→`__` mangling (`@scope__pkg@1.0.0.patch` → `@scope/pkg@1.0.0`). Returns
 * `null` when the name does not end in `.patch` or has an empty stem.
 *
 * @internal
 */
export function patchKeyFromFileName(fileName: string): string | null {
	const SUFFIX = ".patch";
	if (!fileName.endsWith(SUFFIX)) return null;
	const stem = fileName.slice(0, -SUFFIX.length);
	if (stem.length === 0) return null;
	return stem.replace(/__/g, "/");
}
