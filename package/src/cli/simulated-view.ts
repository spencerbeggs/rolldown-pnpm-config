import type { BlockOf, Inline } from "@effected/cli";
import { Doc } from "@effected/cli";
import type { Enforcement, Manifest, ManifestEntry } from "../runtime/types.js";
import { scalarText } from "./diff/render.js";
import { row, tone } from "./render/tone.js";
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
function enforcementSegs(e: Enforcement): Inline[] {
	if (e === "warn") return [tone(" · warn", "changed")];
	if (e === "error") return [tone(" · error", "warn")];
	return [];
}

/** The trailing "(merge)" / "(overwrite · error)" annotation for one field. */
function annotation(entry: ManifestEntry | undefined): Inline[] {
	if (!entry) return [];
	const verb = STRATEGY_VERB[entry.strategy] ?? "merge";
	return [tone("  (", "unchanged"), tone(verb, verb), ...enforcementSegs(entry.enforcement), tone(")", "unchanged")];
}

/** Flatten one key/value into YAML-shaped plain lines; `ann` annotates the head. */
function flatten(key: string, value: unknown, depth: number, ann: Inline[]): Array<ReadonlyArray<Inline>> {
	if (Array.isArray(value)) {
		const header = row(" ", depth, [tone(`${key}:`, "plain"), ...ann]);
		const items = value.map((el) => row(" ", depth + 1, [tone(`- ${scalarText(el)}`, "plain")]));
		return [header, ...items];
	}
	if (value !== null && typeof value === "object") {
		const header = row(" ", depth, [tone(`${key}:`, "plain"), ...ann]);
		const kids = Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => flatten(k, v, depth + 1, []));
		return [header, ...kids];
	}
	return [row(" ", depth, [tone(`${key}: ${scalarText(value)}`, "plain"), ...ann])];
}

/**
 * Render the Simulated view: the calculated fresh-consumer config as a plain
 * pnpm-workspace.yaml listing (NOT a diff against the local file — nothing is
 * added or removed), each top-level field annotated with how the plugin would
 * combine it (`merge`/`overwrite`) and its enforcement (`warn`/`error`).
 *
 * @internal
 */
export function renderSimulated(vanilla: Record<string, unknown>, manifest: Manifest): BlockOf<"Lines"> {
	const canon = canonicalize(vanilla) as Record<string, unknown>;
	return Doc.lines(Object.entries(canon).flatMap(([k, v]) => flatten(k, v, 0, annotation(manifest[k]))));
}
