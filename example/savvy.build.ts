import { defineBuild, runBuild } from "@savvy-web/bundler";
import { PnpmConfigPlugin, defineCatalogs, definePlugin } from "rolldown-pnpm-config";

const plugin = definePlugin({
	catalogs: defineCatalogs([{ name: "silk", peers: true, packages: { typescript: "^5.9.0", vitest: "^4.0.0" } }]),
});

const config = defineBuild({
	plugins: [PnpmConfigPlugin(plugin)],
	meta: false,
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
