import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DiscoverError, discoverCatalogEntries } from "../../src/cli/discover.js";

const source = readFileSync(fileURLToPath(new URL("./fixtures/sample-config.ts.txt", import.meta.url)), "utf8");

describe("discoverCatalogEntries", () => {
	it("finds bare and object-form range literals with spans", () => {
		const { entries } = discoverCatalogEntries(source, "sample-config.ts");
		const ts = entries.find((e) => e.pkg === "typescript");
		expect(ts).toMatchObject({ catalog: "silk", currentRange: "^5.9.0", operator: "^" });
		// span points at the quoted literal
		expect(source.slice(ts?.rangeSpan[0], ts?.rangeSpan[1])).toBe('"^5.9.0"');

		const vitest = entries.find((e) => e.pkg === "vitest");
		expect(vitest).toMatchObject({ currentRange: "^4.0.0", strategy: "lock-minor" });
		expect(vitest?.peer).toBeDefined();
		expect(source.slice(vitest?.peer?.span[0], vitest?.peer?.span[1])).toBe('"^4.0.0"');
	});

	it("skips packages whose range is not a simple-operator literal", () => {
		const { entries, skipped } = discoverCatalogEntries(source, "sample-config.ts");
		expect(entries.find((e) => e.pkg === "effect")).toBeUndefined();
		expect(skipped).toContain("silk.effect");
	});

	it("returns no entries when there is no PnpmConfigPlugin call", () => {
		const { entries } = discoverCatalogEntries("export const x = 1;", "x.ts");
		expect(entries).toEqual([]);
	});

	it("raises DiscoverError on a source that fails to parse", () => {
		expect(() => discoverCatalogEntries("const x = = = ;", "broken.ts")).toThrow(DiscoverError);
	});

	it("returns no entries when catalogs is not an object literal", () => {
		const { entries } = discoverCatalogEntries(
			`import { PnpmConfigPlugin } from "rolldown-pnpm-config"; const c = {}; export const p = PnpmConfigPlugin({ name: "@test/cfg", catalogs: c });`,
			"x.ts",
		);
		expect(entries).toEqual([]);
	});

	it("returns no entries when a catalog has no packages object", () => {
		const { entries } = discoverCatalogEntries(
			`import { PnpmConfigPlugin } from "rolldown-pnpm-config"; export const p = PnpmConfigPlugin({ name: "@test/cfg", catalogs: { silk: {} } });`,
			"x.ts",
		);
		expect(entries).toEqual([]);
	});

	it("recognizes the interop strategy", () => {
		const src = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
PnpmConfigPlugin({ name: "@test/cfg", catalogs: { effect: { packages: {
 effect: { range: "^3.17.0", strategy: "interop" },
} } } });`;
		const { entries } = discoverCatalogEntries(src, "c.ts");
		expect(entries[0]?.strategy).toBe("interop");
	});
});
