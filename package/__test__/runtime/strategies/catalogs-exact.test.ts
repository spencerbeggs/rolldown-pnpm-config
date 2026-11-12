import { describe, expect, it } from "vitest";
import { normalizeCatalogs } from "../../../src/catalogs.js";
import { catalogs } from "../../../src/runtime/strategies/catalogs.js";
import { singleVersionOf } from "../../../src/runtime/strategies/single-version.js";

const ctx = { rootName: undefined };
const options = { exactCatalogs: ["effected"] };

const managed = {
	effected: { a: "^1.0.0", b: "^2.0.0", c: "^3.0.0" },
	"effected:exact": { a: "1.0.0", b: "2.0.0" },
	"effected:peers": { a: ">=1.0.0 <2.0.0" },
};

describe("catalogs strategy: derived :exact variant", () => {
	it("re-derives <name>:exact when a local override names a single version", () => {
		const r = catalogs(managed, { effected: { a: "^1.5.0" } }, ctx, options);
		const merged = r.merged as Record<string, Record<string, string>>;
		expect(merged.effected?.a).toBe("^1.5.0");
		expect(merged["effected:exact"]).toEqual({ a: "1.5.0", b: "2.0.0" });
		const d = r.divergences.find((x) => x.setting === "catalogs.effected.a");
		expect(d?.detail).toContain("effected:exact");
		expect(d?.detail).toContain("followed");
	});

	it("lets an explicit local <name>:exact entry win over the derivation", () => {
		const r = catalogs(managed, { effected: { a: "^1.5.0" }, "effected:exact": { a: "1.4.0" } }, ctx, options);
		const merged = r.merged as Record<string, Record<string, string>>;
		expect(merged["effected:exact"]?.a).toBe("1.4.0");
		const d = r.divergences.find((x) => x.setting === "catalogs.effected.a");
		expect(d?.detail).toContain("local effected:exact entry sets it instead");
		expect(d?.detail).not.toContain("followed");
	});

	it("leaves exact alone for a non-derivable range, without failing, and says so", () => {
		for (const range of [">=1 <2", "*", "latest"]) {
			const r = catalogs(managed, { effected: { a: range } }, ctx, options);
			const merged = r.merged as Record<string, Record<string, string>>;
			expect(merged["effected:exact"]?.a).toBe("1.0.0");
			const d = r.divergences.find((x) => x.setting === "catalogs.effected.a");
			expect(d?.detail).toContain("effected:exact");
			expect(d?.detail).toContain("managed value");
		}
	});

	it("keeps a package the managed exact catalog leaves out (exact: false) out", () => {
		const r = catalogs(managed, { effected: { c: "^3.5.0" } }, ctx, options);
		const merged = r.merged as Record<string, Record<string, string>>;
		expect(merged["effected:exact"]).toEqual({ a: "1.0.0", b: "2.0.0" });
		const d = r.divergences.find((x) => x.setting === "catalogs.effected.c");
		expect(d?.detail).not.toContain("effected:exact");
	});

	it("notes that <name>:peers keeps its managed value, and does not touch it", () => {
		const r = catalogs(managed, { effected: { a: "^1.5.0" } }, ctx, options);
		const merged = r.merged as Record<string, Record<string, string>>;
		expect(merged["effected:peers"]).toEqual({ a: ">=1.0.0 <2.0.0" });
		const d = r.divergences.find((x) => x.setting === "catalogs.effected.a");
		expect(d?.detail).toContain("effected:peers");
	});

	it("does not re-derive without metadata (older frozen bases)", () => {
		const r = catalogs(managed, { effected: { a: "^1.5.0" } }, ctx);
		const merged = r.merged as Record<string, Record<string, string>>;
		expect(merged["effected:exact"]?.a).toBe("1.0.0");
		const d = r.divergences.find((x) => x.setting === "catalogs.effected.a");
		expect(d?.detail).not.toContain("effected:exact");
	});
});

describe("runtime singleVersionOf agrees with the build's derivation", () => {
	const ranges = [
		"1.2.3",
		"^1.2.3",
		"~1.2.3",
		">=1.2.3",
		"=1.2.3",
		"^1.0.0-rc.1",
		">=1 <2",
		"*",
		"latest",
		"<2.0.0",
		">1.0.0",
		"1.x",
		"workspace:*",
		"^1.2",
	];
	it.each(ranges)("%s", (range) => {
		const runtime = singleVersionOf(range);
		let built: string | undefined;
		try {
			built = normalizeCatalogs({ c: { exact: true, packages: { p: range } } })["c:exact"]?.p;
		} catch {
			built = undefined;
		}
		expect(runtime ?? undefined).toBe(built);
	});
});
