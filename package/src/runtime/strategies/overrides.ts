import type { Divergence, Strategy } from "../types.js";

function mergeMapDetect(
	prefix: string,
	managed: Record<string, string>,
	child: Record<string, string>,
): { merged: Record<string, string>; divergences: Divergence[] } {
	const merged: Record<string, string> = { ...managed };
	const divergences: Divergence[] = [];
	for (const [k, childVersion] of Object.entries(child)) {
		const managedVersion = managed[k];
		if (managedVersion !== undefined && managedVersion !== childVersion) {
			divergences.push({
				setting: `${prefix}.${k}`,
				managedValue: managedVersion,
				localValue: childVersion,
				detail: "Local version overrides the managed version.",
				kind: "override",
			});
		}
		merged[k] = childVersion;
	}
	return { merged, divergences };
}

/**
 * Security overrides: child wins per key; any diff → override divergence.
 * Merge overrides, flagging local divergences.
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
 * and `allowAny` are unioned + sorted. Merges peer-dependency rules,
 * flagging version overrides.
 *
 * @internal
 */
export const peerDependencyRules: Strategy = (base, local) => {
	const managed = (base ?? {}) as {
		allowedVersions?: Record<string, string>;
		ignoreMissing?: string[];
		allowAny?: string[];
	};
	const child = (local ?? {}) as typeof managed;
	const av = mergeMapDetect(
		"peerDependencyRules.allowedVersions",
		managed.allowedVersions ?? {},
		child.allowedVersions ?? {},
	);
	const union = (s: string[] = [], c: string[] = []): string[] =>
		[...new Set([...s, ...c])].sort((a, b) => a.localeCompare(b));
	return {
		merged: {
			allowedVersions: av.merged,
			ignoreMissing: union(managed.ignoreMissing, child.ignoreMissing),
			allowAny: union(managed.allowAny, child.allowAny),
		},
		divergences: av.divergences,
	};
};
