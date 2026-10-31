// Temporary bridge for the Effect 4.1 upgrade.
//
// The build toolchain (@savvy-web/*, @okfit/*, @tsdoctor/*, @vitest-agent/*)
// still ships on @effected releases built on Effect 4.0.7. Those import
// `Crypto` from the `effect` root, which 4.1 removed, so under the catalog
// plugin's graph-wide `effect@4.1.1` override they die at import. This hook
// keeps every published toolchain and @effected package on the Effect it was
// built on by turning its Effect-line edges into npm aliases of 4.0.7, which
// slip past the plugin's version-selector override. Private workspace
// packages are left alone and resolve 4.1.1.
//
// Remove once every tool we build with has republished on an @effected
// release built on Effect 4.1 (then no lockfile `packages:` entry names
// effect@4.0.7).
const BRIDGED = "4.0.7";
const TOOLCHAIN = ["@savvy-web/", "@okfit/", "@tsdoctor/", "@vitest-agent/"];

const isEffectFamily = (name) => name === "effect" || name.startsWith("@effect/");

// Only edges still on Effect's 4.0 line are bridged: a kit release built on
// 4.1 (peer `~4.1.0`) passes through untouched, so this workspace's own
// @effected dependencies stay on 4.1.1. `@effect/tsgo` and
// `@effect/language-service` version separately and never match.
const isEffectLine = (name, spec) => isEffectFamily(name) && /^[\^~=]*4\.0\./.test(String(spec).trim());

const reachesKit = (pkg) =>
	[pkg.dependencies, pkg.peerDependencies, pkg.optionalDependencies].some((deps) =>
		Object.keys(deps ?? {}).some((name) => name.startsWith("@effected/")),
	);

function readPackage(pkg) {
	if (pkg.private === true || !pkg.name) return pkg;
	const bridged =
		(pkg.version === BRIDGED && isEffectLine(pkg.name, pkg.version)) ||
		pkg.name.startsWith("@effected/") ||
		TOOLCHAIN.some((prefix) => pkg.name.startsWith(prefix)) ||
		reachesKit(pkg);
	if (!bridged) return pkg;
	const pinned = {};
	for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
		for (const name of Object.keys(pkg[field] ?? {})) {
			if (!isEffectLine(name, pkg[field][name])) continue;
			delete pkg[field][name];
			pinned[name] = `npm:${name}@${BRIDGED}`;
		}
	}
	if (Object.keys(pinned).length > 0) pkg.dependencies = { ...pkg.dependencies, ...pinned };
	return pkg;
}

module.exports = { hooks: { readPackage } };
