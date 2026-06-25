import type { Divergence, Strategy } from "../types.js";

/**
 * `{...silk, ...child}` — child wins per key. Quiet. Ports Silk `merge-map.ts`.
 *
 * @internal
 */
export const mapChildWins: Strategy = (base, local) => {
	const silk = (base ?? {}) as Record<string, unknown>;
	const child = local as Record<string, unknown> | undefined;
	return { merged: child ? { ...silk, ...child } : { ...silk }, divergences: [] };
};

/**
 * `{...silk, ...child}`; flags enabling a build silk blocked. Ports Silk
 * `detectAllowBuildsLoosening`.
 *
 * @internal
 */
export const allowBuilds: Strategy = (base, local) => {
	const silk = (base ?? {}) as Record<string, boolean>;
	const child = (local ?? {}) as Record<string, boolean>;
	const divergences: Divergence[] = [];
	for (const [pkg, childAllowed] of Object.entries(child)) {
		if (childAllowed === true && silk[pkg] === false) {
			divergences.push({
				setting: `allowBuilds.${pkg}`,
				silkValue: "false",
				childValue: "true",
				detail: `Enables build scripts for "${pkg}" that Silk blocked.`,
				kind: "security",
			});
		}
	}
	return { merged: { ...silk, ...child }, divergences };
};
