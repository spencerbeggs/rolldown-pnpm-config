import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inferWorkspaceStyle, parseWorkspace, renderWorkspace, writeWorkspace } from "../../src/cli/workspace-file.js";

// Stored as `.yaml.txt` so the pre-commit YAML formatter cannot normalize away
// the very style each fixture is named for.
const FIXTURES = join(import.meta.dirname, "fixtures", "workspace-style");
const fixture = (name: string): string => readFileSync(join(FIXTURES, `${name}.txt`), "utf8");

/** The source with `effect` bumped to ~4.1.1, everything else as parsed. */
function bumpEffect(source: string): Record<string, unknown> {
	const ws = parseWorkspace(source) as { catalogs: { effected: Record<string, string> } };
	ws.catalogs.effected.effect = "~4.1.1";
	return ws;
}

describe("inferWorkspaceStyle", () => {
	it("reads double quotes, indented sequences and 2-space indent", () => {
		expect(inferWorkspaceStyle(fixture("double-indented.yaml"))).toMatchObject({
			indent: 2,
			indentSequences: true,
			quoteStyle: "double",
			lineWidth: 0,
		});
	});

	it("reads single quotes and unindented sequences", () => {
		expect(inferWorkspaceStyle(fixture("single-unindented.yaml"))).toMatchObject({
			indent: 2,
			indentSequences: false,
			quoteStyle: "single",
		});
	});

	it("reads a 4-space indent", () => {
		expect(inferWorkspaceStyle(fixture("four-space.yaml"))).toMatchObject({ indent: 4, indentSequences: true });
	});

	it("takes the dominant quote style of a mixed file", () => {
		expect(inferWorkspaceStyle(fixture("mixed-quotes.yaml")).quoteStyle).toBe("double");
	});

	it("falls back to the historical defaults for dimensions with no votes", () => {
		expect(inferWorkspaceStyle(fixture("no-votes.yaml"))).toMatchObject({
			indent: 2,
			indentSequences: false,
			quoteStyle: "single",
		});
	});
});

describe("writeWorkspace", () => {
	it.each(["double-indented.yaml", "single-unindented.yaml", "four-space.yaml"])(
		"changes only the changed line in %s",
		(name) => {
			const source = fixture(name);
			const out = writeWorkspace(source, bumpEffect(source));
			expect(out).toBe(
				source.replace('effect": ~4.1.0', 'effect": ~4.1.1').replace("effect': ~4.1.0", "effect': ~4.1.1"),
			);
		},
	);

	it.each(["double-indented.yaml", "single-unindented.yaml", "four-space.yaml"])(
		"keeps the quotes and trailing comment of a changed scalar in %s",
		(name) => {
			const source = fixture(name);
			const ws = parseWorkspace(source) as { catalogs: { effected: Record<string, string> } };
			ws.catalogs.effected["@effect/ai-anthropic"] = "~4.1.1";
			expect(writeWorkspace(source, ws)).toBe(source.replace("~4.1.0 # pinned", "~4.1.1 # pinned"));
		},
	);

	it("inserts new keys and sequences in the file's own style", () => {
		const source = fixture("double-indented.yaml");
		const next = bumpEffect(source) as Record<string, unknown> & { catalogs: { effected: Record<string, string> } };
		next.catalogs.effected["@effect/vitest"] = "~4.1.1";
		next.publicHoistPattern = ["@types/*"];
		const out = writeWorkspace(source, next);
		expect(out).toContain('    "effect": ~4.1.1\n    "@effect/vitest": ~4.1.1\n');
		expect(out.endsWith('publicHoistPattern:\n  - "@types/*"\n')).toBe(true);
		expect(out).toContain("# Repo workspace — hand-maintained.\n");
		expect(out).toContain("# pinned with the kit");
		expect(parseWorkspace(out)).toEqual(next);
	});

	it("keeps the author's key order and removes dropped keys in place", () => {
		const source = fixture("single-unindented.yaml");
		const { minimumReleaseAgeExclude: _dropped, ...next } = parseWorkspace(source);
		expect(writeWorkspace(source, next)).toBe(source.slice(0, source.indexOf("minimumReleaseAgeExclude:")));
	});

	it("is a no-op when nothing changed, including a reordered sequence", () => {
		const source = fixture("double-indented.yaml");
		const next = parseWorkspace(source) as { packages: string[] };
		next.packages = [...next.packages].reverse();
		expect(writeWorkspace(source, next)).toBe(source);
	});

	it("renders an empty or new file exactly as renderWorkspace does", () => {
		const next = { packages: ["pkg/*"], catalogs: { silk: { "@types/node": "^24.0.0" } } };
		expect(writeWorkspace("", next)).toBe(renderWorkspace(next));
		expect(writeWorkspace("\n  \n", next)).toBe(renderWorkspace(next));
	});

	it("re-renders in the inferred style when the source is not a mapping", () => {
		// A top-level sequence votes for double quotes but not for nested-sequence indentation.
		const next = { publicHoistPattern: ["@types/*"] };
		expect(writeWorkspace('- "a"\n', next)).toBe('publicHoistPattern:\n- "@types/*"\n');
	});

	it("adds one item to an all-quoted list without touching the others", () => {
		const source = 'onlyBuiltDependencies:\n  - "esbuild"\n  - "sharp"\nstrictDepBuilds: true\n';
		const out = writeWorkspace(source, { onlyBuiltDependencies: ["esbuild", "sharp", "zz"], strictDepBuilds: true });
		expect(out).toBe('onlyBuiltDependencies:\n  - "esbuild"\n  - "sharp"\n  - "zz"\nstrictDepBuilds: true\n');
	});

	it("removes one item from a list without touching the others", () => {
		const source = "onlyBuiltDependencies:\n- 'esbuild' # native\n- 'sharp'\n- 'swc'\n";
		const out = writeWorkspace(source, { onlyBuiltDependencies: ["esbuild", "swc"] });
		expect(out).toBe("onlyBuiltDependencies:\n- 'esbuild' # native\n- 'swc'\n");
	});

	it("quotes a new key where the file quotes keys by choice", () => {
		const source = fixture("double-indented.yaml");
		const next = parseWorkspace(source) as { catalogs: { effected: Record<string, string> } };
		next.catalogs.effected.vitest = "^4.0.0";
		expect(writeWorkspace(source, next)).toContain('    "effect": ~4.1.0\n    "vitest": ^4.0.0\n');
	});

	it("leaves a new key plain where the file quotes only what it must", () => {
		const source = 'catalogs:\n  effected:\n    "@effect/vitest": ~4.1.0\n    effect: ~4.1.0\n';
		const out = writeWorkspace(source, {
			catalogs: { effected: { "@effect/vitest": "~4.1.0", effect: "~4.1.0", vitest: "^4.0.0" } },
		});
		expect(out).toBe(`${source}    vitest: ^4.0.0\n`);
	});

	it("keeps CRLF line endings on both the splice and the insert path", () => {
		const source = "packages:\r\n  - pkg/*\r\ncatalogs:\r\n  silk:\r\n    typescript: ^5.8.0\r\n";
		const out = writeWorkspace(source, {
			packages: ["pkg/*"],
			catalogs: { silk: { typescript: "^5.9.0" } },
			strictDepBuilds: true,
		});
		expect(out).toBe(
			"packages:\r\n  - pkg/*\r\ncatalogs:\r\n  silk:\r\n    typescript: ^5.9.0\r\nstrictDepBuilds: true\r\n",
		);
	});

	it("never leaves a dangling alias when an anchored node changes", () => {
		const source = "onlyBuiltDependencies: &b\n  - esbuild\nignoredBuiltDependencies: *b\n";
		const next = { onlyBuiltDependencies: ["esbuild", "sharp"], ignoredBuiltDependencies: ["esbuild"] };
		expect(parseWorkspace(writeWorkspace(source, next))).toEqual(next);
	});

	it("does not change an alias's value when a scalar under its anchor is spliced", () => {
		const source = "catalogs:\n  a:\n    effect: &v ~4.1.0\n  b:\n    effect: *v\n";
		const next = { catalogs: { a: { effect: "~4.1.1" }, b: { effect: "~4.1.0" } } };
		expect(parseWorkspace(writeWorkspace(source, next))).toEqual(next);
	});

	it("never writes a key that collides with an existing non-string key", () => {
		const out = writeWorkspace("1: a\n", { "1": "b" });
		expect(parseWorkspace(out)).toEqual({ "1": "b" });
		expect(out.trim().split("\n")).toHaveLength(1);
	});
});
