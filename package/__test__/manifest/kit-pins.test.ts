import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The package publishes a CLI, so it owns its kit closure: every `@effected/*`,
 * `@effect/*` and `effect` dependency is written `catalog:effected:exact`, which
 * publishes a plain version. A caret would let a newer kit patch reach an
 * installed copy without a release of this package, and let a kit library
 * inside it take a peer from another release line.
 */
const KIT = /^(@effected\/|@effect\/|effect$)/;
const EXACT = "catalog:effected:exact";

/**
 * Kit packages the `effected` catalog does not carry yet, pinned to the exact
 * version they will first publish at. `@effected/pnpm` joins the catalog with
 * its first release; move it to `catalog:effected:exact` then, and this list
 * empties. The build resolves `catalog:` specifiers itself, so the catalog
 * form cannot be written before the catalog has the entry.
 */
const NOT_YET_CATALOGUED: Readonly<Record<string, string>> = { "@effected/pnpm": "0.1.0" };

const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
	readonly dependencies?: Record<string, string>;
	readonly peerDependencies?: Record<string, string>;
};

describe("kit dependency pins", () => {
	const kitDeps = Object.entries(manifest.dependencies ?? {}).filter(([name]) => KIT.test(name));

	it("declares kit dependencies", () => {
		expect(kitDeps.length).toBeGreaterThan(0);
	});

	it("writes every kit dependency as catalog:effected:exact", () => {
		const loose = kitDeps.filter(([name, spec]) => spec !== EXACT && spec !== NOT_YET_CATALOGUED[name]);
		expect(loose).toEqual([]);
	});

	it("takes no kit package as a peer", () => {
		const kitPeers = Object.keys(manifest.peerDependencies ?? {}).filter((name) => KIT.test(name));
		expect(kitPeers).toEqual([]);
	});
});
