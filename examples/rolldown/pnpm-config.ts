import type { PluginConfig } from "rolldown-pnpm-config";

export const plugin = {
	catalogs: { default: { packages: { typescript: "^5.9.0", vitest: "^4.0.0" } } },
	overrides: { "tar@<6.2.1": ">=6.2.1" },
	publicHoistPattern: ["@types/*"],
	allowBuilds: { esbuild: true },
	strictDepBuilds: true,
	minimumReleaseAge: { value: 1440, enforcement: "warn" },
	confirmModulesPurge: false,
} satisfies PluginConfig;
