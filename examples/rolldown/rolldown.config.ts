import { defineConfig } from "rolldown";
import { PnpmConfigPlugin } from "rolldown-pnpm-config";

let outfile = "pnpmfile.mjs";
if (process.env.npm_lifecycle_event === "build:dev") {
	outfile = "dist/dev/pkg/pnpmfile.mjs";
} else if (process.env.npm_lifecycle_event === "build:prod") {
	outfile = "dist/prod/pkg/pnpmfile.mjs";
}

export default defineConfig({
	input: "src/pnpmfile.ts",
	// The emitted pnpmfile runs under Node in the consuming repo, so target node:
	// this externalizes `node:*` builtins instead of trying to bundle them.
	platform: "node",
	output: { file: outfile, format: "esm" },
	plugins: [
		PnpmConfigPlugin({
			name: "@example/rolldown",
			catalogs: {
				default: {
					packages: {
						typescript: "^5.9.0",
						vitest: "^4.0.0",
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
});
