import type { Divergence, Strategy } from "../types.js";

function mergeMapDetect(
	prefix: string,
	silk: Record<string, string>,
	child: Record<string, string>,
): { merged: Record<string, string>; divergences: Divergence[] } {
	const merged: Record<string, string> = { ...silk };
	const divergences: Divergence[] = [];
	for (const [k, childVersion] of Object.entries(child)) {
		const silkVersion = silk[k];
		if (silkVersion !== undefined && silkVersion !== childVersion) {
			divergences.push({
				setting: `${prefix}.${k}`,
				silkValue: silkVersion,
				childValue: childVersion,
				detail: "Local version overrides the Silk-managed version.",
				kind: "override",
			});
		}
		merged[k] = childVersion;
	}
	return { merged, divergences };
}

/**
 * Security overrides: child wins per key; any diff → override divergence. Ports
 * Silk `merge-overrides.ts`.
 *
 * @internal
 */
export const overrides: Strategy = (base, local) => {
	const { merged, divergences } = mergeMapDetect(
		"overrides",
		(base ?? {}) as Record<string, string>,
		(local ?? {}) as Record<string, string>,
	);
	return { merged, divergences };
};

/**
 * peerDependencyRules: `allowedVersions` is override-detected; `ignoreMissing`
 * and `allowAny` are unioned + sorted. Ports Silk
 * `merge-peer-dependency-rules.ts`.
 *
 * @internal
 */
export const peerDependencyRules: Strategy = (base, local) => {
	const silk = (base ?? {}) as {
		allowedVersions?: Record<string, string>;
		ignoreMissing?: string[];
		allowAny?: string[];
	};
	const child = (local ?? {}) as typeof silk;
	const av = mergeMapDetect(
		"peerDependencyRules.allowedVersions",
		silk.allowedVersions ?? {},
		child.allowedVersions ?? {},
	);
	const union = (s: string[] = [], c: string[] = []): string[] =>
		[...new Set([...s, ...c])].sort((a, b) => a.localeCompare(b));
	return {
		merged: {
			allowedVersions: av.merged,
			ignoreMissing: union(silk.ignoreMissing, child.ignoreMissing),
			allowAny: union(silk.allowAny, child.allowAny),
		},
		divergences: av.divergences,
	};
};
