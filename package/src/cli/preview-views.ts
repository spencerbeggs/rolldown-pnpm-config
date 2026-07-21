import type { Manifest } from "../runtime/types.js";
import { WORKSPACE_FIELDS } from "./commands/export.js";
import { buildDiff } from "./diff/build.js";
import { renderExportDiff } from "./diff/render.js";
import type { DiffMeta } from "./diff/types.js";
import { effectiveManaged, vanillaManaged } from "./effective.js";
import { renderSimulated } from "./simulated-view.js";
import type { StyledLine } from "./ui/styled.js";
import { canonicalize } from "./workspace-file.js";
import { overlayWorkspace } from "./workspace-overlay.js";

/**
 * Build the three preview views as styled lines: Changes (parsed→merged diff,
 * with local + preserve + excludeByRepo), Full (same tree, full verbosity), and
 * Simulated (the fresh-consumer output rendered as a plain calculated file — not
 * a diff — with per-field merge/overwrite + enforcement annotations).
 *
 * @internal
 */
export function buildPreviewViews(input: {
	managed: Record<string, unknown>;
	local?: Record<string, unknown>;
	parsed: Record<string, unknown>;
	manifest: Manifest;
	rootName: string | undefined;
}): { changes: StyledLine[]; full: StyledLine[]; simulated: StyledLine[] } {
	const meta: DiffMeta = {
		localKeys: new Set(input.local ? Object.keys(input.local) : []),
		managedKeys: WORKSPACE_FIELDS,
	};
	const effective = effectiveManaged(input.managed, input.local, input.parsed, input.manifest, input.rootName);
	const merged = overlayWorkspace(effective, input.parsed);
	const vanilla = vanillaManaged(input.managed, input.manifest, input.rootName);

	const before = canonicalize(input.parsed) as Record<string, unknown>;
	const changesTree = buildDiff(before, canonicalize(merged) as Record<string, unknown>, meta);

	return {
		changes: renderExportDiff(changesTree, { full: false }),
		full: renderExportDiff(changesTree, { full: true }),
		// Not a diff: the calculated fresh-consumer file with rule annotations.
		simulated: renderSimulated(vanilla, input.manifest),
	};
}
