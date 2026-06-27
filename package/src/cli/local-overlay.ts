/**
 * Apply the export-only `local` overlay: each field on `config.local` replaces
 * the corresponding top-level field, and the `local` key is removed. Shallow
 * per-field replace; pure.
 *
 * @internal
 */
export function applyLocal(config: Record<string, unknown>): Record<string, unknown> {
	const { local, ...rest } = config;
	if (local && typeof local === "object") {
		return { ...rest, ...(local as Record<string, unknown>) };
	}
	return { ...rest };
}
