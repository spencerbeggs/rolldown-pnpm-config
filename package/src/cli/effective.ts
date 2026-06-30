import { excludeByRepo } from "../runtime/ctx.js";
import type { Manifest } from "../runtime/types.js";
import { applyLocalDirective } from "./local-merge.js";

/** Apply the manifest's excludeByRepo refine to publicHoistPattern, if present. */
function applyExcludeByRepo(out: Record<string, unknown>, manifest: Manifest, rootName: string | undefined): void {
	const byRepo = manifest.publicHoistPattern?.options?.excludeByRepo as Record<string, string[]> | undefined;
	const phl = out.publicHoistPattern;
	if (byRepo && typeof byRepo === "object" && Array.isArray(phl)) {
		out.publicHoistPattern = excludeByRepo(phl as string[], { rootName }, byRepo);
	}
}

/**
 * Compute the effective workspace fields for THIS repo: managed base, then
 * excludeByRepo on publicHoistPattern, then per-field local directives.
 * `overrides` always runs (default file-protocol preserve), even with no local.
 *
 * @internal
 */
export function effectiveManaged(
	managed: Record<string, unknown>,
	local: Record<string, unknown> | undefined,
	parsed: Record<string, unknown>,
	manifest: Manifest,
	rootName: string | undefined,
): Record<string, unknown> {
	const out: Record<string, unknown> = { ...managed };
	applyExcludeByRepo(out, manifest, rootName);

	const fields = new Set<string>(["overrides", ...Object.keys(local ?? {})]);
	for (const field of fields) {
		const next = applyLocalDirective(out[field], local?.[field], parsed[field], field);
		if (next === undefined) delete out[field];
		else out[field] = next;
	}
	return out;
}

/**
 * The fresh-consumer ("vanilla") workspace fields: managed base + excludeByRepo
 * only — no local overlay and no preserve.
 *
 * @internal
 */
export function vanillaManaged(
	managed: Record<string, unknown>,
	manifest: Manifest,
	rootName: string | undefined,
): Record<string, unknown> {
	const out: Record<string, unknown> = { ...managed };
	applyExcludeByRepo(out, manifest, rootName);
	return out;
}
