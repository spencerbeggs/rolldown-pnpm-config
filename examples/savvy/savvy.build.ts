import { build } from "@savvy-web/bundler";
import { PnpmConfigPlugin } from "rolldown-pnpm-config";

await build({
	plugins: [
		PnpmConfigPlugin({
			name: "@example/savvy",
			catalogs: {
				silk: {
					packages: {
						"@changesets/cli": {
							range: "^3.0.0-next.8",
							peer: "^3.0.0-next.8",
							strategy: "lock",
						},
						typescript: {
							range: "^5.9.0",
							peer: "^5.9.0",
							strategy: "lock-minor",
						},
						vitest: {
							range: "^4.0.0",
							peer: "^4.0.0",
							strategy: "lock-minor",
						},
					},
				},
				effect: {
					packages: {
						unrealldgfsg: {
							range: "^3.15.0",
							peer: "^3.15.0",
							strategy: "interop",
						},
						"@effect/platform": {
							range: "^0.75.0",
							peer: "^0.75.0",
							strategy: "interop",
						},
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
		}),
	],
	bundleNodeModules: true,
	looseFiles: {
		"pnpmfile.mjs": "./src/pnpmfile.ts",
		"pnpmfile.cjs": "./src/pnpmfile.ts",
	},
});
