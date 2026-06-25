import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { freeze } from "../../src/plugin/freeze.js";
import { loadSilkCatalogs } from "./oracle.js";
import { silkConfig } from "./silk.config.js";

const oracle = loadSilkCatalogs();

// Skips cleanly when Silk's built artifacts are absent (e.g. CI). The
// `oracle is present` guard in parity.int.test.ts flags a forgotten local build.
describe.skipIf(oracle === null)("silk.config base parity", () => {
	it("freeze(silkConfig).base reproduces Silk's silk-managed values", async () => {
		if (!oracle) return; // narrows type for TS; skipIf already gates execution
		const { silkCatalogs, silkPeerDependencyRules } = oracle;
		const { base } = await Effect.runPromise(freeze(silkConfig));

		// Catalogs
		expect((base.catalogs as Record<string, unknown>).silk).toEqual(silkCatalogs.silk);
		expect((base.catalogs as Record<string, unknown>).silkPeers).toEqual(silkCatalogs.silkPeers);

		// Overrides
		expect(base.overrides).toEqual(silkCatalogs.silkOverrides);

		// publicHoistPattern — freeze strips excludeByRepo into manifest.options; base holds only the value array
		expect(base.publicHoistPattern).toEqual(silkCatalogs.silkPublicHoistPattern);

		// allowBuilds
		expect(base.allowBuilds).toEqual(silkCatalogs.silkAllowBuilds);

		// allowedDeprecatedVersions
		expect(base.allowedDeprecatedVersions).toEqual(silkCatalogs.silkAllowedDeprecatedVersions);

		// Boolean flags
		expect(base.strictDepBuilds).toEqual(silkCatalogs.silkStrictDepBuilds);
		expect(base.blockExoticSubdeps).toEqual(silkCatalogs.silkBlockExoticSubdeps);
		expect(base.confirmModulesPurge).toEqual(silkCatalogs.silkConfirmModulesPurge);

		// Release age
		expect(base.minimumReleaseAge).toEqual(silkCatalogs.silkMinimumReleaseAge);
		expect(base.minimumReleaseAgeExclude).toEqual(silkCatalogs.silkMinimumReleaseAgeExclude);

		// Peer dependency rules
		expect(base.peerDependencyRules).toEqual(silkPeerDependencyRules);

		// Note: packageExtensions / supportedArchitectures / auditConfig are empty
		// ({}) in Silk and intentionally omitted from silk.config.ts, so they are
		// not asserted here. Their omission is fully guarded by the differential
		// empty-`{}` case in parity.int.test.ts, which compares the whole merged
		// object against Silk's pnpmfile and would fail if any field diverged.
	});
});
