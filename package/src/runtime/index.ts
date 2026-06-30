import { excludeByRepo, resolveRootName } from "./ctx.js";
import { applyEnforcement } from "./enforcement.js";
import { STRATEGY_TABLE } from "./strategies/table.js";
import type { Base, Divergence, Manifest, PnpmConfig, PnpmHooks, RuntimeCtx } from "./types.js";
import { formatOverrideWarning, formatSecurityWarning } from "./warnings.js";

export * from "./types.js";

/**
 * Build the pnpm hooks from frozen base data + a field→strategy manifest.
 * Zero dependencies — bundled verbatim into the shipped pnpmfile.
 *
 * @remarks
 * `updateConfig` deliberately has no catch-and-fall-back-to-local guard: an
 * `error`-enforced divergence throws `EnforcementError`, which is meant to
 * propagate and fail the install. If a swallow-guard is ever added here, it MUST
 * rethrow `EnforcementError` (check `err instanceof EnforcementError` /
 * `err.name === "EnforcementError"`) rather than fall back to the local config.
 *
 * @public
 */
export function createHooks(base: Base, manifest: Manifest, name: string): PnpmHooks {
	return {
		updateConfig(config) {
			const ctx: RuntimeCtx = { rootName: resolveRootName(config) };
			const out: PnpmConfig = { ...config };
			const allOverrides: Divergence[] = [];
			const allSecurity: Divergence[] = [];
			for (const [field, entry] of Object.entries(manifest)) {
				const strategy = STRATEGY_TABLE[entry.strategy];
				if (!strategy) continue;
				const result = strategy(base[field], config[field], ctx);
				// Apply any data-driven refine (e.g. excludeByRepo on publicHoistPattern)
				// to the merged value before enforcement.
				let merged = result.merged;
				const byRepo = entry.options?.excludeByRepo as Record<string, string[]> | undefined;
				if (byRepo && Array.isArray(merged)) {
					merged = excludeByRepo(merged as string[], ctx, byRepo);
				}
				// Field-agnostic strategies (securityFlag/securityMin) emit setting:"";
				// fill it with the field name here, where the name is known.
				const named = result.divergences.map((d) => (d.setting === "" ? { ...d, setting: field } : d));
				const { value, overrides, security } = applyEnforcement(
					field,
					{ merged, divergences: named },
					entry.enforcement,
				);
				allOverrides.push(...overrides);
				allSecurity.push(...security);
				if (value !== undefined && !(typeof value === "object" && value !== null && Object.keys(value).length === 0)) {
					out[field] = value;
				}
			}
			const ob = formatOverrideWarning(allOverrides, name);
			if (ob) console.warn(ob);
			const sb = formatSecurityWarning(allSecurity, name);
			if (sb) console.warn(sb);
			return out;
		},
	};
}
