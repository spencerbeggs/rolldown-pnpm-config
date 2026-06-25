import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const SILK_PNPMFILE = "/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/dist/dev/pkg/pnpmfile.cjs";
const SILK_CATALOGS = "/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/dist/dev/pkg/catalogs/generated.js";

/** Silk's own pnpmfile hooks — the parity oracle. Returns null if unbuilt (test skips with guidance). */
export function loadSilkOracle(): {
	updateConfig(config: Record<string, unknown>): Record<string, unknown>;
} | null {
	if (!existsSync(SILK_PNPMFILE)) return null;
	const req = createRequire(import.meta.url);
	return (
		req(SILK_PNPMFILE) as {
			hooks: { updateConfig(c: Record<string, unknown>): Record<string, unknown> };
		}
	).hooks;
}

interface SilkCatalogOracle {
	silkCatalogs: {
		silk: Record<string, string>;
		silkPeers: Record<string, string>;
		silkOverrides: Record<string, string>;
		silkPublicHoistPattern: string[];
		silkAllowBuilds: Record<string, boolean>;
		silkAllowedDeprecatedVersions: Record<string, string>;
		silkMinimumReleaseAge: number;
		silkMinimumReleaseAgeExclude: string[];
		silkStrictDepBuilds: boolean;
		silkBlockExoticSubdeps: boolean;
		silkConfirmModulesPurge: boolean;
	};
	silkPeerDependencyRules: {
		allowedVersions: Record<string, string>;
		ignoreMissing: string[];
		allowAny: string[];
	};
}

/** Silk's generated catalog data — the base-parity oracle. Loaded via createRequire to avoid TS7016. */
export function loadSilkCatalogs(): SilkCatalogOracle {
	const req = createRequire(import.meta.url);
	return req(SILK_CATALOGS) as SilkCatalogOracle;
}
