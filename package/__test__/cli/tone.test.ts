import { Doc, Render } from "@effected/cli";
import { describe, expect, it } from "vitest";
import { row, tone } from "../../src/cli/render/tone.js";
import { plainText } from "./utils/doc.js";

const human = (color: "none" | "256") => Render.contextOf({ audience: "human", color });
const ansi = (r: ReturnType<typeof row>, color: "none" | "256" = "256") => Render.ansi([Doc.line(r)], human(color));

describe("row", () => {
	it("renders gutter, indent, and text", () => {
		expect(plainText(Doc.line(row("+", 1, [tone("react: ^19", "added")])))).toBe("+   react: ^19");
	});

	it("appends the tag annotation in the text, whatever the colour", () => {
		const r = row("░", 0, [tone("packages:", "unmanaged")], "unmanaged");
		expect(plainText(Doc.line(r))).toBe("░ packages:  (unmanaged)");
		expect(ansi(r)).toContain("(unmanaged)");
	});

	it("keeps the local tag", () => {
		expect(plainText(Doc.line(row("·", 0, [tone("overrides:", "local")], "local")))).toBe("· overrides:  (local)");
	});
});

describe("tone", () => {
	it("paints unmanaged a fixed gray, distinct from the dim unchanged", () => {
		const unmanaged = ansi(row(" ", 0, [tone("p", "unmanaged")]));
		const unchanged = ansi(row(" ", 0, [tone("p", "unchanged")]));
		expect(unmanaged).toContain("\x1b[38;5;240m");
		expect(unchanged).toContain("\x1b[2m");
	});

	it("paints for a person at a colour level, and the same text otherwise", () => {
		const r = row("+", 0, [tone("a", "added")]);
		expect(ansi(r)).toContain("\x1b[32m");
		expect(ansi(r, "none")).toBe("+ a");
		// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes are the subject
		expect(ansi(r).replace(/\x1b\[[0-9;]*m/g, "")).toBe(plainText(Doc.line(r)));
	});

	it("never carries an escape for an agent, even through the ANSI renderer", () => {
		const r = row("+", 0, [tone("a", "added")], "local");
		expect(Render.ansi([Doc.line(r)], Render.contextOf({ audience: "agent", color: "256" }))).not.toContain("\x1b[");
	});

	it("leaves plain text untoned", () => {
		expect(tone("x", "plain")).toEqual(Doc.text("x"));
	});
});
