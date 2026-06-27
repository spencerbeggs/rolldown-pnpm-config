import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { filterEntriesByCatalog, findConfigFiles, pickConfigCandidate } from "../../src/cli/select-file.js";
import type { CatalogEntry } from "../../src/cli/types.js";

const entry = (catalog: string, pkg: string): CatalogEntry => ({
	catalog,
	pkg,
	currentRange: "^1.0.0",
	operator: "^",
	rangeSpan: [0, 8],
});

describe("pickConfigCandidate", () => {
	it("returns the single match", () => {
		expect(pickConfigCandidate(["a.ts"])).toEqual({ ok: true, file: "a.ts" });
	});
	it("errors on zero matches", () => {
		expect(pickConfigCandidate([])).toMatchObject({ ok: false });
	});
	it("errors on multiple matches and lists them", () => {
		const r = pickConfigCandidate(["a.ts", "b.ts"]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.message).toContain("a.ts");
	});
});

const CONFIG = `import { PnpmConfigPlugin } from "rolldown-pnpm-config";
export const plugin = PnpmConfigPlugin({ catalogs: { silk: { packages: { typescript: "^5.9.0" } } } });
`;

describe("findConfigFiles", () => {
	it("returns only .ts files that contain a PnpmConfigPlugin catalog", async () => {
		const dir = mkdtempSync(join(tmpdir(), "rpc-detect-"));
		writeFileSync(join(dir, "config.ts"), CONFIG, "utf8");
		writeFileSync(join(dir, "config.d.ts"), CONFIG, "utf8");
		writeFileSync(join(dir, "other.ts"), "export const x = 1;\n", "utf8");
		writeFileSync(join(dir, "notes.md"), "ignore me\n", "utf8");
		const matches = await Effect.runPromise(findConfigFiles(dir));
		expect(matches.map((m) => m.endsWith("config.ts"))).toEqual([true]);
	});
});

describe("filterEntriesByCatalog", () => {
	const entries = [entry("silk", "a"), entry("react", "b")];
	it("returns all when no catalog given", () => {
		expect(filterEntriesByCatalog(entries, undefined)).toHaveLength(2);
	});
	it("filters to the named catalog", () => {
		const out = filterEntriesByCatalog(entries, "silk");
		expect(out.map((e) => e.pkg)).toEqual(["a"]);
	});
});
