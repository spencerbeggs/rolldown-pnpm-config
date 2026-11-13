import { describe, expect, it } from "@effect/vitest";
import { PnpmSettingsCatalog } from "@effected/pnpm/settings";
import { FIELD_REGISTRY, FIELD_SCHEMAS, MANAGED_FIELDS, WORKSPACE_FIELDS } from "../../src/registry.js";
import { STRATEGY_TABLE } from "../../src/runtime/strategies/table.js";

/** Settings no pnpm 12 reads: phantoms, pnpm 11's, and the five build settings pnpm 12 never applies. */
const NOT_PNPM_12 = [
	"allowNonAppliedPatches",
	"ignoreDepScripts",
	"ignorePatchFailures",
	"managePackageManagerVersions",
	"packageManagerStrict",
	"packageManagerStrictVersion",
	"useNodeVersion",
	"onlyBuiltDependencies",
	"onlyBuiltDependenciesFile",
	"neverBuiltDependencies",
	"ignoredBuiltDependencies",
	"executionEnv",
	"confirmModulesPurge",
] as const;

describe("field policy table", () => {
	it("manages 108 settings", () => {
		expect(MANAGED_FIELDS).toHaveLength(108);
	});

	for (const field of MANAGED_FIELDS) {
		it(`${field}: names a known strategy and a pnpm 12 setting`, () => {
			const policy = FIELD_REGISTRY[field];
			expect(STRATEGY_TABLE[policy.strategy], `unknown strategy "${policy.strategy}"`).toBeDefined();
			expect(Object.hasOwn(PnpmSettingsCatalog.entries, field)).toBe(true);
			expect(FIELD_SCHEMAS[field]).toBe(PnpmSettingsCatalog.entries[field].schema);
		});
	}

	it("offers no setting pnpm 12 does not read", () => {
		for (const field of NOT_PNPM_12) {
			expect(Object.hasOwn(FIELD_REGISTRY, field), field).toBe(false);
			expect(Object.hasOwn(PnpmSettingsCatalog.entries, field), field).toBe(false);
		}
	});

	it("exports exactly the managed fields pnpm 12 reads from pnpm-workspace.yaml", () => {
		for (const field of MANAGED_FIELDS) {
			expect(WORKSPACE_FIELDS.has(field), field).toBe(
				PnpmSettingsCatalog.entries[field].locations.includes("workspace"),
			);
		}
		expect(WORKSPACE_FIELDS.has("catalogs")).toBe(true);
		expect(WORKSPACE_FIELDS.has("publicHoistPattern")).toBe(true);
		expect(WORKSPACE_FIELDS.has("overrides")).toBe(true);
	});
});
