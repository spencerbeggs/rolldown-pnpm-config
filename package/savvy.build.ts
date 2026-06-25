import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultManifestTransform, defineBuild, parseArgs, runBuild } from "@savvy-web/bundler";

const config = defineBuild({
	// rolldown is a devDep for type resolution only; externalize it from the dts
	// pass so its types are NOT inlined into index.d.ts (which would create a
	// second identity for rolldown's Plugin type, causing exactOptionalPropertyTypes
	// mismatches when consumers also use rolldown via @savvy-web/bundler).
	dtsExternals: ["rolldown"],
	// The ./virtual export is types-only (no JS module). Its source points to a
	// .d.ts file that extractEntries skips — no JS or DTS pass runs for it.
	// transformExports preserves { "types": "./src/virtual.d.ts" } as-is, so we
	// correct the path to the emitted dist location in the custom transform below.
	// Supplying a transform REPLACES the default; call defaultManifestTransform
	// explicitly to keep the standard build/dev-only field stripping.
	transform: ({ pkg }) => {
		const result = defaultManifestTransform({ pkg });
		const exports = result.exports as Record<string, unknown> | undefined;
		if (exports?.["./virtual"] !== undefined) {
			return { ...result, exports: { ...exports, "./virtual": { types: "./virtual.d.ts" } } };
		}
		return result;
	},
});

export default config;

if (import.meta.main) {
	await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });

	// The ./virtual export carries only a "types" condition (no JS) so the bundler
	// does not emit virtual.d.ts — copy the handwritten source declaration into the
	// built output(s) manually, after a successful build.
	const { target } = parseArgs(process.argv.slice(2));
	if (target === "dev" || target === "prod") {
		const srcDts = join(import.meta.dirname, "src/virtual.d.ts");
		interface Pkg {
			publishConfig?: { targets?: Record<string, unknown> };
		}
		const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "package.json"), "utf-8")) as Pkg;

		const outDirs: string[] =
			target === "dev"
				? [join(import.meta.dirname, "dist/dev/pkg")]
				: Object.keys(pkg.publishConfig?.targets ?? { npm: true }).map((id) =>
						join(import.meta.dirname, "dist/prod", id, "pkg"),
					);

		for (const dir of outDirs) {
			if (existsSync(dir)) {
				copyFileSync(srcDts, join(dir, "virtual.d.ts"));
			}
		}
	}
}
