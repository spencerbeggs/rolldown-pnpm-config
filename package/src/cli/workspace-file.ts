import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";

const FILENAME = "pnpm-workspace.yaml";
const STRINGIFY_OPTIONS = { indent: 2, lineWidth: 0, singleQuote: false } as const;

/** Recursively sort object keys for deterministic output; arrays keep order. */
function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, sortKeys(v)]),
		);
	}
	return value;
}

/**
 * Walk up from `startDir` to the nearest directory containing a
 * pnpm-workspace.yaml; returns the file path or null.
 *
 * @internal
 */
export function findWorkspaceFile(startDir: string): string | null {
	let dir = startDir;
	for (;;) {
		const candidate = join(dir, FILENAME);
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** Parse pnpm-workspace.yaml source; empty/whitespace yields an empty object. @internal */
export function parseWorkspace(source: string): Record<string, unknown> {
	const parsed = parse(source) as unknown;
	return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

/** Render a workspace object: deterministic key sort + yaml.stringify. @internal */
export function renderWorkspace(obj: Record<string, unknown>): string {
	return stringify(sortKeys(obj), STRINGIFY_OPTIONS);
}
