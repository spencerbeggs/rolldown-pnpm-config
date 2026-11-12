/** One comparator (`^`, `~`, `>=`, `=` or none) on one full version, prerelease allowed. */
const SINGLE_VERSION_RE = /^(?:\^|~|>=|=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

/**
 * The single version a range names, or `null` when it names none (compound,
 * wildcard, tag, `<`, `>`, partial). A zero-dependency mirror of the build's
 * `singleVersionOf` in `catalogs.ts`; a test pins the two together.
 *
 * @internal
 */
export function singleVersionOf(range: string): string | null {
	const match = SINGLE_VERSION_RE.exec(range.trim());
	return match?.[1] ?? null;
}
