import { defineBuild, runBuild } from "@savvy-web/bundler";

const config = defineBuild({
	// rolldown is a devDep for type resolution only; externalize it from the dts
	// pass so its types are NOT inlined into index.d.ts (which would create a
	// second identity for rolldown's Plugin type, causing exactOptionalPropertyTypes
	// mismatches when consumers also use rolldown via @savvy-web/bundler).
	dtsExternals: ["rolldown"],
});

export default config;

if (import.meta.main) {
	await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
}
