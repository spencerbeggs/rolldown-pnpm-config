import type { Enforcement, Manifest, ManifestEntry } from "../runtime/types.js";
import type { Segment, StyledLine } from "./ui/styled.js";
import { canonicalize } from "./workspace-file.js";

/**
 * How each merge strategy combines a managed field with the consumer's local
 * value, in the vocabulary the Simulated view shows: `merge` (values combined)
 * or `overwrite` (the plugin value replaces the local one). Keyed by manifest
 * strategy name; a new strategy defaults to `merge` and should be classified here.
 */
const STRATEGY_VERB: Record<string, "merge" | "overwrite"> = {
	scalar: "overwrite",
	securityFlag: "overwrite",
	securityMin: "overwrite",
	catalogs: "merge",
	mapChildWins: "merge",
	arrayUnion: "merge",
	arrayRecordUnion: "merge",
	overrides: "merge",
	peerDependencyRules: "merge",
	allowBuilds: "merge",
};

/** The enforcement suffix, e.g. " · warn" / " · error"; empty when silent. */
function enforcementSegs(e: Enforcement): Segment[] {
	if (e === "warn") return [{ text: " · warn", style: "changed" }];
	if (e === "error") return [{ text: " · error", style: "warn" }];
	return [];
}

/** The trailing "(merge)" / "(overwrite · error)" annotation for one field. */
function annotation(entry: ManifestEntry | undefined): Segment[] {
	if (!entry) return [];
	const verb = STRATEGY_VERB[entry.strategy] ?? "merge";
	return [
		{ text: "  (", style: "unchanged" },
		{ text: verb, style: verb },
		...enforcementSegs(entry.enforcement),
		{ text: ")", style: "unchanged" },
	];
}

function scalarText(v: unknown): string {
	return typeof v === "string" ? v : JSON.stringify(v);
}

/** Flatten one key/value into YAML-shaped plain lines; `ann` annotates the head. */
function flatten(key: string, value: unknown, depth: number, ann: Segment[]): StyledLine[] {
	if (Array.isArray(value)) {
		const header: StyledLine = { indent: depth, gutter: " ", segments: [{ text: `${key}:`, style: "plain" }, ...ann] };
		const items = value.map<StyledLine>((el) => ({
			indent: depth + 1,
			gutter: " ",
			segments: [{ text: `- ${scalarText(el)}`, style: "plain" }],
		}));
		return [header, ...items];
	}
	if (value !== null && typeof value === "object") {
		const header: StyledLine = { indent: depth, gutter: " ", segments: [{ text: `${key}:`, style: "plain" }, ...ann] };
		const kids = Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => flatten(k, v, depth + 1, []));
		return [header, ...kids];
	}
	return [{ indent: depth, gutter: " ", segments: [{ text: `${key}: ${scalarText(value)}`, style: "plain" }, ...ann] }];
}

/**
 * Render the Simulated view: the calculated fresh-consumer config as a plain
 * pnpm-workspace.yaml listing (NOT a diff against the local file — nothing is
 * added or removed), each top-level field annotated with how the plugin would
 * combine it (`merge`/`overwrite`) and its enforcement (`warn`/`error`).
 *
 * @internal
 */
export function renderSimulated(vanilla: Record<string, unknown>, manifest: Manifest): StyledLine[] {
	const canon = canonicalize(vanilla) as Record<string, unknown>;
	return Object.entries(canon).flatMap(([k, v]) => flatten(k, v, 0, annotation(manifest[k])));
}
