export const INPUTS: Array<Record<string, unknown>> = [
	{},
	{ catalogs: { silk: { typescript: "5.0.0" } } },
	{ strictDepBuilds: false, minimumReleaseAge: 60 },
	{ allowBuilds: { esbuild: true, "some-blocked-pkg": true } },
	{
		publicHoistPattern: ["local-only"],
		packageExtensions: { foo: { dependencies: { bar: "1" } } },
	},
	{ rootProjectManifest: { name: "savvy-web-systems" } },
	{ rootProjectManifest: { name: "vitest-agent" } },
	{ peerDependencyRules: { allowAny: ["react"], ignoreMissing: ["@x/y"] } },
	{ overrides: { "tar@<6.2.1": ">=7" } },
	// Ported from Silk "merges full catalogs with local overrides"
	{
		catalogs: { silk: { typescript: "^5.5.0" }, myApp: { react: "^18.0.0" } },
		overrides: { "custom-security-fix": "^1.0.0" },
		onlyBuiltDependencies: ["my-native-dep"],
		publicHoistPattern: ["my-cli-tool"],
	},
	// Ported from Silk "merges allowBuilds and warns on security loosening"
	{ allowBuilds: { "core-js": true }, strictDepBuilds: false },
];
