import { describe, expect, it } from "vitest";
import { buildDiff } from "../../src/cli/diff/build.js";
import type { DiffMeta } from "../../src/cli/diff/types.js";

const meta = (o: Partial<DiffMeta> = {}): DiffMeta => ({
	localKeys: new Set(),
	managedKeys: new Set(["catalogMode", "dedupeDirectDeps", "catalogs", "onlyBuiltDependencies"]),
	...o,
});

const child = (root: ReturnType<typeof buildDiff>, key: string) => (root.children ?? []).find((c) => c.key === key);

describe("buildDiff", () => {
	it("marks an added key", () => {
		const root = buildDiff({}, { dedupeDirectDeps: true }, meta());
		expect(child(root, "dedupeDirectDeps")?.kind).toBe("added");
	});

	it("marks a changed scalar with before/after", () => {
		const root = buildDiff({ catalogMode: "strict" }, { catalogMode: "manual" }, meta());
		const n = child(root, "catalogMode");
		expect(n?.kind).toBe("changed");
		expect(n?.before).toBe("strict");
		expect(n?.after).toBe("manual");
	});

	it("marks an unchanged key", () => {
		const root = buildDiff({ catalogMode: "manual" }, { catalogMode: "manual" }, meta());
		expect(child(root, "catalogMode")?.kind).toBe("unchanged");
	});

	it("tags an unmanaged top-level key present only via the file", () => {
		const root = buildDiff({ packages: ["a/*"] }, { packages: ["a/*"] }, meta());
		expect(child(root, "packages")?.tag).toBe("unmanaged");
	});

	it("tags a local override (orthogonal to change kind)", () => {
		const root = buildDiff(
			{ catalogMode: "manual" },
			{ catalogMode: "manual" },
			meta({ localKeys: new Set(["catalogMode"]) }),
		);
		const n = child(root, "catalogMode");
		expect(n?.tag).toBe("local");
		expect(n?.kind).toBe("unchanged");
	});

	it("recurses into objects (catalogs) and reports a changed leaf", () => {
		const root = buildDiff(
			{ catalogs: { default: { react: "^19.0.0" } } },
			{ catalogs: { default: { react: "^19.2.0" } } },
			meta(),
		);
		const cat = child(root, "catalogs");
		const def = (cat?.children ?? []).find((c) => c.key === "default");
		const react = (def?.children ?? []).find((c) => c.key === "react");
		expect(react?.kind).toBe("changed");
		expect(react?.before).toBe("^19.0.0");
		expect(react?.after).toBe("^19.2.0");
	});

	it("renders a wholly-added object as a branch of all-added leaves", () => {
		const root = buildDiff({}, { catalogs: { default: { react: "^19.2.0" } } }, meta());
		const cat = child(root, "catalogs");
		expect(cat?.kind).toBe("added");
		const def = (cat?.children ?? []).find((c) => c.key === "default");
		const react = (def?.children ?? []).find((c) => c.key === "react");
		expect(react?.kind).toBe("added");
	});

	it("set-diffs arrays into added/removed/unchanged element nodes", () => {
		const root = buildDiff(
			{ onlyBuiltDependencies: ["esbuild", "swc"] },
			{ onlyBuiltDependencies: ["esbuild", "sharp"] },
			meta(),
		);
		const arr = child(root, "onlyBuiltDependencies");
		const kinds = Object.fromEntries((arr?.children ?? []).map((c) => [c.key, c.kind]));
		expect(kinds.esbuild).toBe("unchanged");
		expect(kinds.sharp).toBe("added");
		expect(kinds.swc).toBe("removed");
	});
});
