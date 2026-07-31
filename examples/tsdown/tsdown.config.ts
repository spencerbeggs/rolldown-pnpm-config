import { PnpmConfigPlugin } from "rolldown-pnpm-config";
import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/pnpmfile.ts"],
	plugins: [
		PnpmConfigPlugin({
			name: "@example/tsdown",
			catalogs: {
				effect: {
					packages: {
						"@effect/ai-anthropic": {
							range: "^4.0.0-beta.98",
							peer: "^4.0.0-beta.98",
							strategy: "lock",
						},
					},
				},
			},
		}),
	],
	exports: true,
	sourcemap: process.env.NODE_ENV === "development" || false,
	dts: {
		neverBundle: true,
	},
});
