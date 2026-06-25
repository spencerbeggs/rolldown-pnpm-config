import type { Divergence, Strategy } from "../types.js";

/**
 * `child ?? silk` — quiet (no divergences). Ports Silk `merge-scalar.ts`.
 *
 * @internal
 */
export const scalar: Strategy = (base, local) => ({
	merged: local ?? base,
	divergences: [],
});

/**
 * `child ?? silk`; flags when child disables a silk-enabled boolean. The
 * strategy is field-agnostic, so it emits `setting: ""`; the runtime fills the
 * field name. Ports Silk `detectFlagLoosening`.
 *
 * @internal
 */
export const securityFlag: Strategy = (base, local) => {
	const merged = (local ?? base) as boolean | undefined;
	const divergences: Divergence[] = [];
	if (base === true && local === false) {
		divergences.push({
			setting: "",
			silkValue: "true",
			childValue: "false",
			detail: "Disables a security check that Silk enabled.",
			kind: "security",
		});
	}
	return { merged, divergences };
};

/**
 * `child ?? silk`; flags when child lowers the value. Field-agnostic, so it
 * emits `setting: ""`; the runtime fills the field name. Ports Silk
 * `detectMinReleaseAgeLoosening`.
 *
 * @internal
 */
export const securityMin: Strategy = (base, local) => {
	const merged = (local ?? base) as number | undefined;
	const divergences: Divergence[] = [];
	if (typeof base === "number" && typeof local === "number" && local < base) {
		divergences.push({
			setting: "",
			silkValue: String(base),
			childValue: String(local),
			detail: `Shortens the release-age quarantine from ${base} to ${local} minutes.`,
			kind: "security",
		});
	}
	return { merged, divergences };
};
