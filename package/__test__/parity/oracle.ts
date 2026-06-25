import { existsSync } from "node:fs";
import { createRequire } from "node:module";

// Silk's built artifacts live in a sibling repo. Default to the canonical local
// checkout; allow an override (CI, or another contributor's layout) via SILK_DIST.
// When absent, the loaders below return null and the parity suites skip cleanly.
const SILK_DIST = process.env.SILK_DIST ?? "/Users/spencer/workspaces/savvy-web/pnpm-plugin-silk/dist/dev/pkg";
const SILK_PNPMFILE = `${SILK_DIST}/pnpmfile.cjs`;
const SILK_CATALOGS = `${SILK_DIST}/catalogs/generated.js`;

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

/** Silk's generated catalog data — the base-parity oracle. Returns null if the
 *  sibling artifact is absent (e.g. CI) so base-parity skips cleanly instead of
 *  crashing at module load. Loaded via createRequire to avoid TS7016. */
export function loadSilkCatalogs(): SilkCatalogOracle | null {
	if (!existsSync(SILK_CATALOGS)) return null;
	const req = createRequire(import.meta.url);
	return req(SILK_CATALOGS) as SilkCatalogOracle;
}
