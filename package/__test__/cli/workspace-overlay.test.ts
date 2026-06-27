import { describe, expect, it } from "vitest";
import { overlayWorkspace } from "../../src/cli/workspace-overlay.js";

describe("overlayWorkspace", () => {
	it("overwrites managed fields and preserves unknown keys", () => {
		const merged = overlayWorkspace(
			{ publicHoistPattern: ["@types/*"], overrides: { "tar@<6.2.1": ">=6.2.1" } },
			{ packages: ["pkg/*"], publicHoistPattern: ["@old/*"], configDependencies: { x: "1.0.0" } },
		);
		expect(merged).toEqual({
			packages: ["pkg/*"],
			publicHoistPattern: ["@types/*"],
			overrides: { "tar@<6.2.1": ">=6.2.1" },
			configDependencies: { x: "1.0.0" },
		});
	});

	it("overlays catalogs by name and preserves local catalogs", () => {
		const merged = overlayWorkspace(
			{ catalogs: { silk: { typescript: "^5.9.0" } } },
			{ catalogs: { silk: { typescript: "^5.0.0", extra: "^1.0.0" }, tsdown: { tsdown: "^2.0.0" } } },
		);
		expect(merged).toEqual({
			catalogs: { silk: { typescript: "^5.9.0" }, tsdown: { tsdown: "^2.0.0" } },
		});
	});

	it("never deletes a key the plugin does not declare", () => {
		const merged = overlayWorkspace({ publicHoistPattern: ["@types/*"] }, { autoInstallPeers: true });
		expect(merged.autoInstallPeers).toBe(true);
	});
});
