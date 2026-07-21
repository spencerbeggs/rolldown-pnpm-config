import { describe, expect, it } from "vitest";
import { toAnsi } from "../../src/cli/ui/ansi.js";
import type { StyledLine } from "../../src/cli/ui/styled.js";

const line = (o: Partial<StyledLine>): StyledLine => ({
	indent: 0,
	gutter: " ",
	segments: [{ text: "x", style: "plain" }],
	...o,
});

describe("toAnsi", () => {
	it("renders gutter, indent, and text with no color", () => {
		const out = toAnsi([line({ gutter: "+", indent: 1, segments: [{ text: "react: ^19", style: "added" }] })], {
			color: false,
		});
		expect(out).toBe("+   react: ^19");
	});

	it("appends the tag annotation", () => {
		const out = toAnsi(
			[line({ gutter: "░", segments: [{ text: "packages:", style: "unmanaged" }], tag: "unmanaged" })],
			{
				color: false,
			},
		);
		expect(out).toBe("░ packages:  (unmanaged)");
	});

	it("drops the unmanaged tag when color is on, keeps it when color is off", () => {
		const l = line({ gutter: "░", segments: [{ text: "packages:", style: "unmanaged" }], tag: "unmanaged" });
		expect(toAnsi([l], { color: true })).not.toContain("(unmanaged)");
		expect(toAnsi([l], { color: false })).toContain("(unmanaged)");
	});

	it("keeps the local tag regardless of color", () => {
		const l = line({ gutter: "·", segments: [{ text: "overrides:", style: "local" }], tag: "local" });
		expect(toAnsi([l], { color: true })).toContain("(local)");
		expect(toAnsi([l], { color: false })).toContain("(local)");
	});

	it("paints unmanaged with a distinct SGR from unchanged (A3: fixed gray vs dim)", () => {
		const unmanaged = toAnsi([line({ segments: [{ text: "p", style: "unmanaged" }] })], { color: true });
		const unchanged = toAnsi([line({ segments: [{ text: "p", style: "unchanged" }] })], { color: true });
		expect(unmanaged).toContain("\x1b[38;5;240m"); // fixed dark gray
		expect(unchanged).toContain("\x1b[2m"); // theme-adaptive dim
		expect(unmanaged).not.toBe(unchanged);
	});

	it("wraps segments in SGR codes when color is on, same text otherwise", () => {
		const l = line({ gutter: "+", segments: [{ text: "a", style: "added" }] });
		const plain = toAnsi([l], { color: false });
		const colored = toAnsi([l], { color: true });
		expect(colored).toContain("\x1b[32m");
		// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes are valid
		expect(colored.replace(/\x1b\[[0-9]*m/g, "")).toBe(plain);
	});
});
