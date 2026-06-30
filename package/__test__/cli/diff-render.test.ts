import { describe, expect, it } from "vitest";
import { buildDiff } from "../../src/cli/diff/build.js";
import { renderExportDiff } from "../../src/cli/diff/render.js";
import type { DiffMeta } from "../../src/cli/diff/types.js";

const meta: DiffMeta = { localKeys: new Set(), managedKeys: new Set(["catalogMode", "dedupeDirectDeps", "catalogs"]) };
const plain = (lines: ReturnType<typeof renderExportDiff>) =>
	lines.map(
		(l) =>
			`${l.gutter} ${"  ".repeat(l.indent)}${l.segments.map((s) => s.text).join("")}${l.tag ? `  (${l.tag})` : ""}`,
	);

describe("renderExportDiff", () => {
	it("renders a changed scalar inline with a ~ gutter", () => {
		const root = buildDiff({ catalogMode: "strict" }, { catalogMode: "manual" }, meta);
		expect(plain(renderExportDiff(root, { full: true }))).toContain("~ catalogMode: strict → manual");
	});

	it("renders an added scalar with a + gutter", () => {
		const root = buildDiff({}, { dedupeDirectDeps: true }, meta);
		expect(plain(renderExportDiff(root, { full: true }))).toContain("+ dedupeDirectDeps: true");
	});

	it("renders an added object as a block", () => {
		const root = buildDiff({}, { catalogs: { default: { react: "^19.2.0" } } }, meta);
		const out = plain(renderExportDiff(root, { full: true }));
		expect(out).toContain("+ catalogs:");
		expect(out).toContain("+     react: ^19.2.0");
	});

	it("keeps the parent header of a kept nested line (no orphans)", () => {
		const m: DiffMeta = { localKeys: new Set(), managedKeys: new Set(["a_obj", "x", "y"]) };
		const root = buildDiff({ a_obj: { inner: "1" }, x: "1", y: "1" }, { a_obj: { inner: "1" }, x: "1", y: "2" }, m);
		const out = plain(renderExportDiff(root, { full: false }));
		expect(out).toContain("~ y: 1 → 2");
		const innerIdx = out.findIndex((l) => l.includes("inner: 1"));
		expect(innerIdx).toBeGreaterThanOrEqual(0);
		const aObjIdx = out.findIndex((l) => l.includes("a_obj:"));
		expect(aObjIdx).toBeGreaterThanOrEqual(0);
		expect(aObjIdx).toBeLessThan(innerIdx);
	});

	it("collapses far unchanged keys by default but keeps them with full", () => {
		const before = { a1: "x", a2: "x", a3: "x", a4: "x", catalogMode: "strict" };
		const after = { a1: "x", a2: "x", a3: "x", a4: "x", catalogMode: "manual" };
		const m: DiffMeta = { localKeys: new Set(), managedKeys: new Set(["a1", "a2", "a3", "a4", "catalogMode"]) };
		const root = buildDiff(before, after, m);
		const dflt = plain(renderExportDiff(root, { full: false }));
		expect(dflt.some((l) => l.includes("unchanged"))).toBe(true);
		const full = plain(renderExportDiff(root, { full: true }));
		expect(full.filter((l) => l.startsWith("  ")).length).toBeGreaterThan(
			dflt.filter((l) => l.startsWith("  ")).length,
		);
	});
});
