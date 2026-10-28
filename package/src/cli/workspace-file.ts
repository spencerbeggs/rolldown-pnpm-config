import { locateWorkspaceRootSync } from "@effected/workspaces";
import { nodeSyncOps } from "@effected/workspaces/node-sync";
import { Yaml, YamlStringifyOptions } from "@effected/yaml";
import { Predicate, Result } from "effect";

const FILENAME = "pnpm-workspace.yaml";
// lineWidth 0 disables wrapping (parity with the previous `yaml` renderer).
const STRINGIFY_OPTIONS = YamlStringifyOptions.make({ indent: 2, lineWidth: 0 });

/** True when every element is a string/number/boolean (safe to sort). */
function allPrimitive(arr: readonly unknown[]): boolean {
	return arr.every((v) => v === null || (typeof v !== "object" && typeof v !== "function"));
}

/**
 * Canonical form for deterministic output and diffing: object keys alpha-sorted
 * recursively; arrays of all-primitive elements sorted lexicographically;
 * arrays containing objects keep their order.
 *
 * @internal
 */
export function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		const mapped = value.map(canonicalize);
		return allPrimitive(mapped) ? [...mapped].sort((a, b) => String(a).localeCompare(String(b))) : mapped;
	}
	if (Predicate.isObject(value)) {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, canonicalize(v)]),
		);
	}
	return value;
}

/**
 * Walk up from `startDir` to the nearest directory containing a
 * pnpm-workspace.yaml; returns the file path or null. A `package.json`
 * `workspaces` field is not a marker here: this tool targets pnpm only.
 *
 * @internal
 */
export function findWorkspaceFile(startDir: string): string | null {
	return locateWorkspaceRootSync(startDir, { ...nodeSyncOps, markers: [FILENAME] })?.path ?? null;
}

/** Parse pnpm-workspace.yaml source; empty/whitespace yields an empty object. @internal */
export function parseWorkspace(source: string): Record<string, unknown> {
	// A malformed document throws (YamlParseError), matching the previous
	// `yaml` parser's throw-on-error behavior.
	const parsed = Result.getOrThrow(Yaml.parseResult(source));
	return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

/** Render a workspace object: deterministic key sort + yaml.stringify. @internal */
export function renderWorkspace(obj: Record<string, unknown>): string {
	return Result.getOrThrow(Yaml.stringifyResult(canonicalize(obj), STRINGIFY_OPTIONS));
}
