import type { Divergence, Strategy } from "../types.js";

/**
 * `child ?? base` — quiet (no divergences). Prefer local, fall back to managed.
 *
 * @internal
 */
export const scalar: Strategy = (base, local) => ({
	merged: local ?? base,
	divergences: [],
});

/**
 * `child ?? base`; flags when child disables a managed boolean. The strategy is
 * field-agnostic, so it emits `setting: ""`; the runtime fills the field name.
 * Detects flag loosening.
 *
 * @internal
 */
export const securityFlag: Strategy = (base, local) => {
	const merged = (local ?? base) as boolean | undefined;
	const divergences: Divergence[] = [];
	if (base === true && local === false) {
		divergences.push({
			setting: "",
			managedValue: "true",
			localValue: "false",
			detail: "Disables a security check the managed config enabled.",
			kind: "security",
		});
	}
	return { merged, divergences };
};

/**
 * `child ?? base`; flags when child lowers the value. Field-agnostic, so it
 * emits `setting: ""`; the runtime fills the field name. Detects
 * minimum-release-age loosening.
 *
 * @internal
 */
export const securityMin: Strategy = (base, local) => {
	const merged = (local ?? base) as number | undefined;
	const divergences: Divergence[] = [];
	if (typeof base === "number" && typeof local === "number" && local < base) {
		divergences.push({
			setting: "",
			managedValue: String(base),
			localValue: String(local),
			detail: `Shortens the release-age quarantine from ${base} to ${local} minutes.`,
			kind: "security",
		});
	}
	return { merged, divergences };
};
