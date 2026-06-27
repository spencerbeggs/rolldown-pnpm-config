import { defineBuild, runBuild } from "@savvy-web/bundler";
import type { PluginConfig } from "rolldown-pnpm-config";
import { PnpmConfigPlugin } from "rolldown-pnpm-config";

const plugin: PluginConfig = {
	catalogs: {
		silk: {
			packages: {
				typescript: { range: "^5.9.0", peer: "^5.9.0", strategy: "lock-minor" },
				vitest: { range: "^4.0.0", peer: "^4.0.0", strategy: "lock-minor" },
			},
		},
	},
	overrides: {
		"tar@<6.2.1": ">=6.2.1",
	},
	publicHoistPattern: ["@types/*"],
	allowBuilds: {
		esbuild: true,
	},
	strictDepBuilds: true,
	minimumReleaseAge: {
		value: 1440,
		enforcement: "warn",
	},
	confirmModulesPurge: false,
};

const config = defineBuild({
	plugins: [PnpmConfigPlugin(plugin)],
	bundleNodeModules: true,
	looseFiles: {
		"pnpmfile.mjs": "./src/pnpmfile.ts",
		"pnpmfile.cjs": "./src/pnpmfile.ts",
	},
});

export default config;

if (import.meta.main) {
	await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
}
