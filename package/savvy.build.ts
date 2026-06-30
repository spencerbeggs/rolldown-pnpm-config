import { build } from "@savvy-web/bundler";

await build({
	// rolldown is a devDep for type resolution only; externalize it from the dts
	// pass so its types are NOT inlined into index.d.ts (which would create a
	// second identity for rolldown's Plugin type, causing exactOptionalPropertyTypes
	// mismatches when consumers also use rolldown via @savvy-web/bundler).
	dtsExternals: ["rolldown"],
});
