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

	it("wraps segments in SGR codes when color is on, same text otherwise", () => {
		const l = line({ gutter: "+", segments: [{ text: "a", style: "added" }] });
		const plain = toAnsi([l], { color: false });
		const colored = toAnsi([l], { color: true });
		expect(colored).toContain("\x1b[32m");
		// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes are valid
		expect(colored.replace(/\x1b\[[0-9]*m/g, "")).toBe(plain);
	});
});
