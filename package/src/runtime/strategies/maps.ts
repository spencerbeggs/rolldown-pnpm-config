import type { Divergence, Strategy } from "../types.js";

/**
 * `{...managed, ...child}` — child wins per key. Quiet. Merges two maps,
 * preferring child values.
 *
 * @internal
 */
export const mapChildWins: Strategy = (base, local) => {
	const managed = (base ?? {}) as Record<string, unknown>;
	const child = local as Record<string, unknown> | undefined;
	return { merged: child ? { ...managed, ...child } : { ...managed }, divergences: [] };
};

/**
 * `{...managed, ...child}`; flags enabling a build the managed config blocked.
 * Detects allow-builds loosening.
 *
 * @internal
 */
export const allowBuilds: Strategy = (base, local) => {
	const managed = (base ?? {}) as Record<string, boolean>;
	const child = (local ?? {}) as Record<string, boolean>;
	const divergences: Divergence[] = [];
	for (const [pkg, childAllowed] of Object.entries(child)) {
		if (childAllowed === true && managed[pkg] === false) {
			divergences.push({
				setting: `allowBuilds.${pkg}`,
				managedValue: "false",
				localValue: "true",
				detail: `Enables build scripts for "${pkg}" that the managed config blocked.`,
				kind: "security",
			});
		}
	}
	return { merged: { ...managed, ...child }, divergences };
};
