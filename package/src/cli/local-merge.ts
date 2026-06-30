/** Default protocols whose existing-file override entries are preserved. @internal */
export const DEFAULT_PRESERVE: readonly string[] = ["file", "link", "workspace", "portal"];

const DIRECTIVE_KEYS = new Set(["preserve", "value", "strategy"]);

/**
 * True when `v` is the `{ preserve?, value?, strategy? }` directive form: a
 * non-array object whose keys are a non-empty subset of the directive keys.
 * A record with any foreign key (e.g. a real override entry) is a bare value.
 *
 * @internal
 */
export function isLocalDirective(v: unknown): boolean {
	if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
	const keys = Object.keys(v);
	return keys.length > 0 && keys.every((k) => DIRECTIVE_KEYS.has(k));
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Union/difference two records or two arrays; managed is the left operand. */
function combine(managed: unknown, value: unknown, strategy: "union" | "difference"): unknown {
	if (Array.isArray(managed) || Array.isArray(value)) {
		const m = Array.isArray(managed) ? managed : [];
		const v = Array.isArray(value) ? value : [];
		if (strategy === "union") return [...new Set([...m, ...v])];
		const drop = new Set(v.map((x) => JSON.stringify(x)));
		return m.filter((x) => !drop.has(JSON.stringify(x)));
	}
	const m = isRecord(managed) ? managed : {};
	const v = isRecord(value) ? value : {};
	if (strategy === "union") return { ...m, ...v };
	const out: Record<string, unknown> = { ...m };
	for (const k of Object.keys(v)) delete out[k];
	return out;
}

/**
 * Compute the effective value of one field from the managed value, the
 * `config.local[field]` directive (or bare value / undefined), and the parsed
 * existing-file value. For `overrides`, file-protocol entries are preserved
 * from `parsed` (default list unless the directive sets `preserve`).
 *
 * @internal
 */
export function applyLocalDirective(managed: unknown, raw: unknown, parsed: unknown, field: string): unknown {
	const directive = isLocalDirective(raw)
		? (raw as { preserve?: readonly string[]; value?: unknown; strategy?: "union" | "difference" })
		: { value: raw };

	// 1. base value: overwrite / union / difference / passthrough
	let result: unknown;
	if (directive.strategy && directive.value !== undefined) {
		result = combine(managed, directive.value, directive.strategy);
	} else if (directive.value !== undefined) {
		result = directive.value; // overwrite
	} else {
		result = managed; // passthrough (e.g. default preserve only)
	}

	// 2. preserve (overrides only)
	if (field === "overrides") {
		const protocols = directive.preserve ?? DEFAULT_PRESERVE;
		const base: Record<string, unknown> = isRecord(result) ? { ...result } : {};
		if (isRecord(parsed)) {
			for (const [k, val] of Object.entries(parsed)) {
				if (typeof val === "string" && protocols.some((p) => val.startsWith(`${p}:`))) base[k] = val;
			}
		}
		if (Object.keys(base).length === 0 && managed === undefined) return undefined;
		return base;
	}

	return result;
}
