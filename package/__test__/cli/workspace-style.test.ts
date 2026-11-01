import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inferWorkspaceStyle, parseWorkspace, renderWorkspace, writeWorkspace } from "../../src/cli/workspace-file.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "workspace-style");
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

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
});
